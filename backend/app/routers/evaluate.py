"""Evaluation endpoints with SSE streaming."""

import json
from functools import partial

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from ..models import EvalItemsUpdate, EvalItem
from .. import database as db
from ..engine import rag, runner

router = APIRouter(prefix="/api/projects/{project_id}", tags=["evaluate"])


@router.put("/eval-items")
def save_eval_items(project_id: str, body: EvalItemsUpdate):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    db.save_eval_items(project_id, body.items)
    return {"saved": len(body.items)}


@router.get("/eval-items")
def get_eval_items(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    items = db.get_eval_items(project_id)
    return {"items": [item.model_dump() for item in items]}


@router.post("/evaluate")
def run_evaluation(project_id: str):
    """Run evaluation and return results (non-streaming)."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if project.kb_status != "ready":
        raise HTTPException(400, "Knowledge base not ready. Load data first.")

    eval_items = db.get_eval_items(project_id)
    if not eval_items:
        raise HTTPException(400, "No evaluation items configured.")

    collection_name = f"project-{project_id}"
    query_fn = partial(rag.query_rag, project_id, collection_name)

    items_as_dicts = [item.model_dump() for item in eval_items]
    score, failure_reasons, results = runner.evaluate(query_fn, project.prompt_template, items_as_dicts)

    run_id = db.save_eval_run(project_id, project.prompt_template, score, results, failure_reasons)

    return {
        "run_id": run_id,
        "score": round(score, 3),
        "failure_reasons": failure_reasons,
        "results": results,
    }


@router.get("/evaluate/stream")
async def stream_evaluation(project_id: str):
    """Run evaluation with SSE streaming for live progress."""
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

    async def event_generator():
        for event in runner.evaluate_streaming(query_fn, project.prompt_template, items_as_dicts):
            if event["type"] == "complete":
                # Save run to DB
                db.save_eval_run(
                    project_id, project.prompt_template,
                    event["total_score"], event["results"], event["failure_reasons"],
                )
            yield {"event": event["type"], "data": json.dumps(event)}

    return EventSourceResponse(event_generator())


@router.get("/history")
def get_history(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    eval_runs = db.get_eval_runs(project_id)
    opt_runs = db.get_optimization_runs(project_id)
    return {"eval_runs": eval_runs, "optimization_runs": opt_runs}
