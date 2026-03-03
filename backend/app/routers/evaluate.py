"""Evaluation endpoints with SSE streaming and auto-generate."""

import asyncio
import json
import os
from functools import partial
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..models import EvalItemsUpdate, EvalItem
from .. import database as db
from ..engine import rag, runner, auto_eval

router = APIRouter(prefix="/api/projects/{project_id}", tags=["evaluate"])

_DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent.parent)))
PROJECTS_DIR = _DATA_DIR / "projects"


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


class AutoGenRequest(BaseModel):
    num_questions: int = 5


@router.post("/eval-items/auto-generate")
def auto_generate_eval_items(project_id: str, body: AutoGenRequest = AutoGenRequest()):
    """Use Claude to auto-generate evaluation questions from the knowledge base or project description."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    try:
        knowledge_sample = ""

        if project.kb_status == "ready":
            # We have a knowledge base — sample content from it
            collection_name = f"project-{project_id}"
            collection = rag._get_collection(project_id, collection_name)

            # Get a sample of documents from the collection
            sample_results = collection.get(
                limit=20,
                include=["documents"],
            )
            knowledge_sample = "\n\n".join(sample_results["documents"][:20]) if sample_results["documents"] else ""

        # Also try to read KB files from database for richer context
        if not knowledge_sample:
            kb_files = db.get_all_kb_file_contents(project_id)
            if kb_files:
                raw_texts = [kf["content"] for kf in kb_files if kf["content"].strip()]
                if raw_texts:
                    knowledge_sample = "\n\n---\n\n".join(raw_texts)

        # Fallback: read raw files from the data directory
        if not knowledge_sample:
            data_dir = PROJECTS_DIR / project_id / "data"
            if data_dir.exists():
                raw_texts = []
                for f in sorted(data_dir.rglob("*")):
                    if f.is_file() and f.suffix.lower() in {".md", ".txt"} and f.stat().st_size < 50000:
                        try:
                            raw_texts.append(f.read_text(encoding="utf-8"))
                        except Exception:
                            pass
                if raw_texts:
                    knowledge_sample = "\n\n---\n\n".join(raw_texts)

        # Determine source type for the response
        has_kb_content = bool(knowledge_sample)

        if knowledge_sample:
            questions = auto_eval.generate_eval_questions(
                project.description or project.name,
                knowledge_sample,
                num_questions=body.num_questions,
                goal_definition=project.goal_definition or "",
            )
        else:
            # No knowledge content available — generate from description only
            questions = auto_eval.generate_eval_from_description_only(
                project.description or project.name,
                num_questions=body.num_questions,
            )

        # Convert to EvalItem format and save
        eval_items = [
            EvalItem(question=q["question"], required_facts=q["required_facts"])
            for q in questions
        ]
        db.save_eval_items(project_id, eval_items)

        return {
            "items": [item.model_dump() for item in eval_items],
            "count": len(eval_items),
            "source": "knowledge_base" if has_kb_content else "description",
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to generate eval questions: {str(e)}")


@router.post("/evaluate")
def run_evaluation(project_id: str):
    """Run evaluation and return results (non-streaming)."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if project.kb_status != "ready":
        raise HTTPException(400, "Knowledge base not ready. Upload documents and build the knowledge base first.")

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
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _run_sync():
            """Run the blocking evaluation in a thread, push events to queue."""
            try:
                for event in runner.evaluate_streaming(query_fn, project.prompt_template, items_as_dicts):
                    loop.call_soon_threadsafe(queue.put_nowait, event)
            except Exception as e:
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    {"type": "error", "message": str(e)},
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

        # Start blocking work in a background thread
        loop.run_in_executor(None, _run_sync)

        while True:
            event = await queue.get()
            if event is None:
                break
            if event["type"] == "complete":
                db.save_eval_run(
                    project_id, project.prompt_template,
                    event["total_score"], event["results"], event["failure_reasons"],
                )
            # Don't use "error" as SSE event type — it's reserved by EventSource
            # and kills the connection. Use "eval_error" instead.
            event_type = "eval_error" if event["type"] == "error" else event["type"]
            yield {"event": event_type, "data": json.dumps(event)}

    return EventSourceResponse(event_generator())


@router.get("/history")
def get_history(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    eval_runs = db.get_eval_runs(project_id)
    opt_runs = db.get_optimization_runs(project_id)
    return {"eval_runs": eval_runs, "optimization_runs": opt_runs}
