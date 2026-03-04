"""Knowledge Base Builder endpoints with SSE streaming."""

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from .. import database as db
from ..engine import kb_builder, system_docs
from ..models import KBBuildRequest, AlignmentRequest

router = APIRouter(prefix="/api/projects/{project_id}/kb", tags=["knowledge-base"])


# --- Build ---

@router.post("/build")
def start_kb_build(project_id: str, body: KBBuildRequest):
    """Create a KB build record and return build_id for streaming."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Determine mode
    has_urls = bool(body.urls)
    has_notes = bool(body.user_notes.strip())
    if body.mode == "auto":
        if has_urls and has_notes:
            mode = "hybrid"
        elif has_urls:
            mode = "url"
        elif has_notes:
            mode = "notes"
        else:
            raise HTTPException(400, "Provide at least one URL or some notes.")
    else:
        mode = body.mode

    slug = kb_builder._slugify(project.name)
    build_id = db.create_kb_build(
        project_id=project_id,
        mode=mode,
        urls=body.urls,
        user_notes=body.user_notes,
        slug=slug,
    )
    db.update_project(project_id, kb_build_status="building")

    return {"build_id": build_id, "slug": slug, "mode": mode}


@router.get("/stream/{build_id}")
async def stream_kb_build(project_id: str, build_id: str):
    """SSE stream of KB build progress. Saves file content to DB on file_complete events."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    build = db.get_kb_build(build_id)
    if not build:
        raise HTTPException(404, "Build not found")

    db.update_kb_build(build_id, status="building")

    async def event_generator():
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _run_sync():
            try:
                for event in kb_builder.build_knowledge_base(
                    urls=build.urls,
                    user_notes=build.user_notes,
                    project_name=project.name,
                    project_description=project.description,
                    project_id=project_id,
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

            # Save file content to DB when a file is generated
            if event["type"] == "file_complete" and "content" in event:
                db.save_kb_file(
                    project_id=project_id,
                    kb_build_id=build_id,
                    filename=event["filename"],
                    label=event.get("label", event["filename"]),
                    content=event["content"],
                )
                # Don't send full content over SSE — strip it
                sse_event = {k: v for k, v in event.items() if k != "content"}
                yield {"event": event["type"], "data": json.dumps(sse_event)}
            elif event["type"] == "complete":
                # Save meta file to DB
                if "meta_content" in event:
                    db.save_kb_file(
                        project_id=project_id,
                        kb_build_id=build_id,
                        filename="00_meta.json",
                        label="Metadata",
                        content=event["meta_content"],
                    )

                db.update_kb_build(
                    build_id,
                    status="aligned",
                    file_count=event.get("file_count", 0),
                )
                db.update_project(project_id, kb_build_status="aligned")

                # Save alignment questions
                questions = event.get("questions", [])
                if questions:
                    db.save_alignment_items(project_id, build_id, questions)

                # Strip meta_content from SSE
                sse_event = {k: v for k, v in event.items() if k != "meta_content"}
                yield {"event": event["type"], "data": json.dumps(sse_event)}
                final_event = event
            elif event["type"] == "error":
                db.update_kb_build(build_id, status="failed")
                db.update_project(project_id, kb_build_status="none")
                yield {"event": "stream_error", "data": json.dumps(event)}
                final_event = event
            else:
                yield {"event": event["type"], "data": json.dumps(event)}
                final_event = event

    return EventSourceResponse(event_generator())


# --- Files (read from DB) ---

@router.get("/files")
def list_files(project_id: str):
    """List generated KB files from database."""
    build = db.get_latest_kb_build(project_id)
    if not build:
        return {"files": [], "slug": ""}

    files = db.get_kb_files(project_id, build.id)
    return {"files": files, "slug": build.slug}


@router.get("/files/{filename}")
def get_file(project_id: str, filename: str):
    """Read a KB file's content from database."""
    build = db.get_latest_kb_build(project_id)
    if not build:
        raise HTTPException(404, "No KB build found")

    file_data = db.get_kb_file(project_id, filename, build.id)
    if not file_data:
        raise HTTPException(404, "File not found")

    return {"filename": filename, "content": file_data["content"], "slug": build.slug}


class UpdateKBFileRequest(BaseModel):
    content: str


@router.put("/files/{filename}")
def update_file(project_id: str, filename: str, body: UpdateKBFileRequest):
    """Update a KB file's content in database."""
    build = db.get_latest_kb_build(project_id)
    if not build:
        raise HTTPException(404, "No KB build found")

    success = db.update_kb_file(project_id, filename, body.content, build.id)
    if not success:
        raise HTTPException(404, "File not found")

    return {"filename": filename, "size": len(body.content.encode("utf-8"))}


# --- Alignment ---

@router.get("/alignment")
def get_alignment(project_id: str):
    """Get alignment questions for the latest KB build."""
    build = db.get_latest_kb_build(project_id)
    if not build:
        return {"questions": [], "build_id": None}

    items = db.get_alignment_items(build.id)
    return {"questions": items, "build_id": build.id, "slug": build.slug}


@router.post("/align")
def submit_alignment(project_id: str, body: AlignmentRequest):
    """Submit alignment answers. If NO with correction, update the KB file in DB."""
    build = db.get_latest_kb_build(project_id)
    if not build:
        raise HTTPException(404, "No KB build found")

    results = []
    for answer in body.answers:
        # Find matching alignment item
        items = db.get_alignment_items(build.id)
        matched = next(
            (it for it in items if it["question"] == answer.question),
            None,
        )

        if answer.answer:
            # YES — mark as resolved
            if matched:
                db.update_alignment_item(matched["id"], user_answer=True, resolved=True)
            results.append({"question": answer.question, "status": "confirmed"})
        else:
            # NO — apply correction using DB content
            if answer.correction.strip() and matched:
                try:
                    # Read current content from DB
                    file_data = db.get_kb_file(project_id, answer.target_file, build.id)
                    if not file_data:
                        results.append({
                            "question": answer.question,
                            "status": "error",
                            "error": f"File {answer.target_file} not found in DB",
                        })
                        continue

                    # Use Claude to apply correction
                    updated = kb_builder.apply_correction(
                        filename=answer.target_file,
                        current_content=file_data["content"],
                        correction=answer.correction,
                        question=answer.question,
                    )

                    # Save updated content back to DB
                    db.update_kb_file(project_id, answer.target_file, updated, build.id)

                    db.update_alignment_item(
                        matched["id"],
                        user_answer=False,
                        correction=answer.correction,
                        resolved=True,
                    )
                    results.append({
                        "question": answer.question,
                        "status": "corrected",
                        "filename": answer.target_file,
                        "new_size": len(updated),
                    })
                except Exception as e:
                    results.append({
                        "question": answer.question,
                        "status": "error",
                        "error": str(e),
                    })
            else:
                results.append({"question": answer.question, "status": "skipped"})

    # Check if all resolved
    remaining = db.get_alignment_items(build.id)
    all_resolved = all(r.get("resolved") for r in remaining)
    if all_resolved:
        db.update_kb_build(build.id, status="aligned")
        db.update_project(project_id, kb_build_status="aligned")

    return {"results": results, "all_resolved": all_resolved}


# --- System Documents ---

@router.post("/system-docs")
def generate_system_documents(project_id: str):
    """Generate system documents (rubric, guidelines, gap analysis) from goal + KB."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if not project.goal_definition:
        raise HTTPException(400, "Goal definition required. Complete the goal refinement first.")

    # Get KB files
    kb_files = db.get_all_kb_file_contents(project_id)

    try:
        docs = system_docs.generate_system_docs(
            project_description=project.description,
            goal_definition=project.goal_definition,
            kb_files=kb_files,
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to generate system documents: {str(e)}")

    # Save system docs as KB files
    build = db.get_latest_kb_build(project_id)
    if not build:
        raise HTTPException(400, "No KB build found. Build the knowledge base first.")

    saved = []
    for doc in docs:
        # Delete existing system doc with same filename if exists
        existing = db.get_kb_file(project_id, doc["filename"], build.id)
        if existing:
            db.update_kb_file(project_id, doc["filename"], doc["content"], build.id)
        else:
            db.save_kb_file(
                project_id=project_id,
                kb_build_id=build.id,
                filename=doc["filename"],
                label=doc["label"],
                content=doc["content"],
            )
        saved.append({
            "filename": doc["filename"],
            "label": doc["label"],
            "size": len(doc["content"].encode("utf-8")),
        })

    # Update file count
    all_files = db.get_kb_files(project_id, build.id)
    db.update_kb_build(build.id, file_count=len(all_files))

    return {"system_docs": saved, "count": len(saved)}


@router.get("/system-docs/stream")
async def stream_system_docs_endpoint(project_id: str):
    """SSE stream of system document generation progress."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if not project.goal_definition:
        raise HTTPException(400, "Goal definition required.")

    build = db.get_latest_kb_build(project_id)
    if not build:
        raise HTTPException(400, "No KB build found.")

    kb_files = db.get_all_kb_file_contents(project_id)

    async def event_generator():
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _run_sync():
            try:
                for event in system_docs.stream_system_docs(
                    project_description=project.description,
                    goal_definition=project.goal_definition,
                    kb_files=kb_files,
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

        while True:
            event = await queue.get()
            if event is None:
                break

            if event["type"] == "sysdoc_file_complete" and "content" in event:
                # Save to DB
                existing = db.get_kb_file(project_id, event["filename"], build.id)
                if existing:
                    db.update_kb_file(project_id, event["filename"], event["content"], build.id)
                else:
                    db.save_kb_file(
                        project_id=project_id,
                        kb_build_id=build.id,
                        filename=event["filename"],
                        label=event.get("label", event["filename"]),
                        content=event["content"],
                    )
                # Strip content from SSE payload
                sse_event = {k: v for k, v in event.items() if k != "content"}
                yield {"event": event["type"], "data": json.dumps(sse_event)}

            elif event["type"] == "sysdoc_complete":
                # Update file count
                all_files = db.get_kb_files(project_id, build.id)
                db.update_kb_build(build.id, file_count=len(all_files))
                yield {"event": event["type"], "data": json.dumps(event)}

            elif event["type"] == "error":
                yield {"event": "stream_error", "data": json.dumps(event)}

            else:
                yield {"event": event["type"], "data": json.dumps(event)}

    return EventSourceResponse(event_generator())


# --- Status ---

@router.get("/status")
def get_kb_status(project_id: str):
    """Get KB build status for a project."""
    build = db.get_latest_kb_build(project_id)
    if not build:
        return {"status": "none", "build": None}

    return {
        "status": build.status,
        "build": build.model_dump(),
    }
