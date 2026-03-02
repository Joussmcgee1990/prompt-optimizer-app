"""Document upload and knowledge base endpoints."""

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from ..models import DocumentInfo
from .. import database as db
from ..engine import rag

router = APIRouter(prefix="/api/projects/{project_id}/documents", tags=["documents"])

PROJECTS_DIR = Path(__file__).parent.parent.parent / "projects"
ALLOWED_EXTENSIONS = {".md", ".txt", ".pdf"}


def _data_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id / "data"


@router.post("")
async def upload_documents(project_id: str, files: list[UploadFile] = File(...)):
    """Upload one or more documents to a project."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    data_dir = _data_dir(project_id)
    data_dir.mkdir(parents=True, exist_ok=True)

    uploaded = []
    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue

        file_path = data_dir / file.filename
        content = await file.read()
        file_path.write_bytes(content)
        uploaded.append({
            "filename": file.filename,
            "size": len(content),
        })

    return {"uploaded": uploaded, "count": len(uploaded)}


@router.get("")
def list_documents(project_id: str):
    """List uploaded documents for a project."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    data_dir = _data_dir(project_id)
    if not data_dir.exists():
        return {"documents": [], "count": 0}

    docs = []
    for f in sorted(data_dir.iterdir()):
        if f.suffix.lower() in ALLOWED_EXTENSIONS:
            stat = f.stat()
            docs.append(DocumentInfo(
                filename=f.name,
                size=stat.st_size,
                uploaded_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            ))

    return {"documents": docs, "count": len(docs)}


@router.delete("/{filename}")
def delete_document(project_id: str, filename: str):
    """Delete a single uploaded document."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    file_path = _data_dir(project_id) / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")

    file_path.unlink()
    return {"deleted": filename}


@router.post("/load-data")
def load_data(project_id: str, background_tasks: BackgroundTasks):
    """Build the knowledge base from uploaded documents."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    data_dir = _data_dir(project_id)
    if not data_dir.exists() or not any(data_dir.iterdir()):
        raise HTTPException(400, "No documents uploaded yet")

    collection_name = f"project-{project_id}"

    # Clear existing collection
    rag.clear_collection(project_id, collection_name)

    # Update status
    db.update_project(project_id, kb_status="loading")

    def _do_load():
        try:
            doc_count = rag.load_data(project_id, collection_name)
            db.update_project(project_id, kb_status="ready", kb_doc_count=doc_count)
        except Exception as e:
            db.update_project(project_id, kb_status="empty", kb_doc_count=0)
            print(f"Error loading data for project {project_id}: {e}")

    background_tasks.add_task(_do_load)
    return {"status": "loading", "message": "Knowledge base is being built..."}
