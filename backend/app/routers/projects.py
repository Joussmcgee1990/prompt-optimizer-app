"""Projects CRUD endpoints."""

from fastapi import APIRouter, HTTPException
from ..models import ProjectCreate, ProjectUpdate, Project
from .. import database as db

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=Project)
def create_project(body: ProjectCreate):
    return db.create_project(body.name, body.description, body.prompt_template)


@router.get("", response_model=list[Project])
def list_projects():
    return db.list_projects()


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.put("/{project_id}", response_model=Project)
def update_project(project_id: str, body: ProjectUpdate):
    existing = db.get_project(project_id)
    if not existing:
        raise HTTPException(404, "Project not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return existing
    return db.update_project(project_id, **updates)
