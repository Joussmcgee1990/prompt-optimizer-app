"""Document upload, URL research, and knowledge base endpoints."""

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from ..models import DocumentInfo
from .. import database as db
from ..engine import rag, research

router = APIRouter(prefix="/api/projects/{project_id}/documents", tags=["documents"])

_DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent.parent)))
PROJECTS_DIR = _DATA_DIR / "projects"
ALLOWED_EXTENSIONS = {".md", ".txt", ".pdf", ".json"}


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
    for f in sorted(data_dir.rglob("*")):
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
            stat = f.stat()
            # Use relative path from data_dir so KB files show as "knowledge_base/slug/file.md"
            rel_path = f.relative_to(data_dir)
            docs.append(DocumentInfo(
                filename=str(rel_path),
                size=stat.st_size,
                uploaded_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            ))

    return {"documents": docs, "count": len(docs)}


@router.delete("/{filename:path}")
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


class ResearchURLRequest(BaseModel):
    url: str


@router.post("/research-url")
def research_url(project_id: str, body: ResearchURLRequest, background_tasks: BackgroundTasks):
    """Fetch a URL, extract useful content with Claude, and save as a knowledge base document."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        # Do the research synchronously so the user gets the result
        content = research.research_url(url, project.description)
        filename = research.save_research_as_document(project_id, url, content)

        return {
            "filename": filename,
            "url": url,
            "content_length": len(content),
            "content": content,
            "message": f"Successfully researched {url} and saved as {filename}",
        }
    except Exception as e:
        raise HTTPException(400, f"Failed to research URL: {str(e)}")


@router.get("/{filename:path}/content")
def get_document_content(project_id: str, filename: str):
    """Read the content of a document."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    file_path = _data_dir(project_id) / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")

    try:
        content = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "File is not a text document")

    return {"filename": filename, "content": content}


class UpdateContentRequest(BaseModel):
    content: str


@router.put("/{filename:path}/content")
def update_document_content(project_id: str, filename: str, body: UpdateContentRequest):
    """Update the content of a document."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    file_path = _data_dir(project_id) / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")

    file_path.write_text(body.content, encoding="utf-8")

    return {"filename": filename, "size": len(body.content.encode("utf-8"))}


@router.post("/load-data")
def load_data(project_id: str, background_tasks: BackgroundTasks):
    """Build the knowledge base from uploaded documents."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    data_dir = _data_dir(project_id)
    has_filesystem_files = data_dir.exists() and any(data_dir.rglob("*"))
    has_kb_files = bool(db.get_all_kb_file_contents(project_id))
    if not has_filesystem_files and not has_kb_files:
        raise HTTPException(400, "No documents or KB files found")

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
