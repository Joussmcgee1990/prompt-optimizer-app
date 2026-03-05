"""Blind A/B comparison endpoints with SSE streaming."""

import asyncio
import json
from functools import partial

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from .. import database as db
from ..engine import rag, comparator

router = APIRouter(prefix="/api/projects/{project_id}", tags=["compare"])


@router.get("/compare/stream")
async def stream_comparison(project_id: str, optimization_run_id: str = ""):
    """Run blind A/B comparison with SSE streaming for live progress."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if project.kb_status != "ready":
        raise HTTPException(400, "Knowledge base not ready.")

    eval_items = db.get_eval_items(project_id)
    if not eval_items:
        raise HTTPException(400, "No evaluation items configured.")

    # Get before/after prompts
    if optimization_run_id:
        runs = db.get_optimization_runs(project_id)
        run = next((r for r in runs if r["id"] == optimization_run_id), None)
        if not run:
            raise HTTPException(404, "Optimization run not found")
        prompt_before = run["initial_prompt"]
        prompt_after = run["final_prompt"]
    else:
        # Get latest completed optimization run
        runs = db.get_optimization_runs(project_id)
        completed = [r for r in runs if r["status"] in ("completed", "max_retries") and r["final_prompt"]]
        if not completed:
            raise HTTPException(400, "No completed optimization runs found. Run optimization first.")
        run = completed[0]  # Most recent
        optimization_run_id = run["id"]
        prompt_before = run["initial_prompt"]
        prompt_after = run["final_prompt"]

    if not prompt_after:
        raise HTTPException(400, "Optimization run has no final prompt.")

    collection_name = f"project-{project_id}"
    query_fn = partial(rag.query_rag, project_id, collection_name)
    items_as_dicts = [item.model_dump() for item in eval_items]

    async def event_generator():
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _run_sync():
            """Run the blocking comparison in a thread, push events to queue."""
            try:
                for event in comparator.run_comparison(
                    query_fn, prompt_before, prompt_after, items_as_dicts
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

        # Save comparison result
        if final_event and final_event["type"] == "comparison_complete":
            db.save_comparison_run(
                project_id=project_id,
                optimization_run_id=optimization_run_id,
                prompt_before=prompt_before,
                prompt_after=prompt_after,
                overall_winner=final_event["overall_winner"],
                after_wins=final_event["after_wins"],
                before_wins=final_event["before_wins"],
                ties=final_event["ties"],
                dimension_averages=final_event["dimension_averages"],
                question_results=final_event["question_results"],
            )

    return EventSourceResponse(event_generator())


@router.get("/compare/latest")
async def get_latest_comparison(project_id: str):
    """Get the most recent comparison result for this project."""
    result = db.get_latest_comparison_run(project_id)
    if not result:
        return {"comparison": None}
    return {"comparison": result}
