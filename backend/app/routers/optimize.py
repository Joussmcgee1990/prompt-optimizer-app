"""Optimization endpoints with SSE streaming."""

import asyncio
import json
from functools import partial

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from .. import database as db
from ..engine import rag, optimizer

router = APIRouter(prefix="/api/projects/{project_id}", tags=["optimize"])


@router.get("/optimize/stream")
async def stream_optimization(project_id: str):
    """Run optimization loop with SSE streaming for live progress."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if project.kb_status != "ready":
        raise HTTPException(400, "Knowledge base not ready.")

    eval_items = db.get_eval_items(project_id)
    if not eval_items:
        raise HTTPException(400, "No evaluation items configured.")

    collection_name = f"project-{project_id}"
    query_fn = partial(rag.query_rag, project_id, collection_name)
    items_as_dicts = [item.model_dump() for item in eval_items]

    run_id = db.save_optimization_run(project_id, project.prompt_template)

    async def event_generator():
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _run_sync():
            """Run the blocking optimization in a thread, push events to queue."""
            try:
                for event in optimizer.run_optimization(
                    query_fn, project.prompt_template, items_as_dicts
                ):
                    loop.call_soon_threadsafe(queue.put_nowait, event)
            except Exception as e:
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    {"type": "error", "message": str(e)},
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        loop.run_in_executor(None, _run_sync)

        final_event = None
        while True:
            event = await queue.get()
            if event is None:
                break
            event_type = "stream_error" if event["type"] == "error" else event["type"]
            yield {"event": event_type, "data": json.dumps(event)}
            final_event = event

        # Save final state
        if final_event and final_event["type"] in ("complete", "max_retries"):
            db.update_optimization_run(
                run_id,
                final_prompt=final_event["final_prompt"],
                final_score=final_event["final_score"],
                iterations=final_event["iterations"],
                status="completed" if final_event["type"] == "complete" else "max_retries",
            )
            db.update_project(project_id, prompt_template=final_event["final_prompt"])

    return EventSourceResponse(event_generator())


@router.post("/optimize")
def run_optimization_sync(project_id: str):
    """Run optimization (non-streaming fallback)."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if project.kb_status != "ready":
        raise HTTPException(400, "Knowledge base not ready.")

    eval_items = db.get_eval_items(project_id)
    if not eval_items:
        raise HTTPException(400, "No evaluation items configured.")

    collection_name = f"project-{project_id}"
    query_fn = partial(rag.query_rag, project_id, collection_name)
    items_as_dicts = [item.model_dump() for item in eval_items]

    run_id = db.save_optimization_run(project_id, project.prompt_template)

    final_event = None
    for event in optimizer.run_optimization(query_fn, project.prompt_template, items_as_dicts):
        final_event = event

    if final_event and final_event["type"] in ("complete", "max_retries"):
        db.update_optimization_run(
            run_id,
            final_prompt=final_event["final_prompt"],
            final_score=final_event["final_score"],
            iterations=final_event["iterations"],
            status="completed" if final_event["type"] == "complete" else "max_retries",
        )
        db.update_project(project_id, prompt_template=final_event["final_prompt"])

    return final_event
