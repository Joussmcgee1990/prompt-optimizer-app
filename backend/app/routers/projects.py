"""Projects CRUD endpoints."""

import json
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..models import ProjectCreate, ProjectUpdate, Project
from .. import database as db
from ..engine import prompt_gen, goal_builder

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


class GeneratePromptRequest(BaseModel):
    description: str = ""
    name: str = ""


# --- Goal Definition ---

@router.post("/{project_id}/goal/questions")
def get_goal_questions(project_id: str):
    """Generate clarifying questions to tighten the goal definition."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if not project.description.strip():
        raise HTTPException(400, "Project description is required to generate goal questions.")

    try:
        questions = goal_builder.generate_goal_questions(project.description)
        return {"questions": questions}
    except Exception as e:
        raise HTTPException(500, f"Failed to generate goal questions: {str(e)}")


class GoalAnswer(BaseModel):
    id: str
    question: str
    answer: str


class GoalSaveRequest(BaseModel):
    answers: List[GoalAnswer]


@router.post("/{project_id}/goal/save")
def save_goal(project_id: str, body: GoalSaveRequest):
    """Save goal answers and generate the goal definition document."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Save answers as JSON
    answers_json = json.dumps([a.model_dump() for a in body.answers])

    # Generate goal definition
    try:
        goal_def = goal_builder.build_goal_definition(
            project.description,
            [a.model_dump() for a in body.answers],
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to generate goal definition: {str(e)}")

    # Update project
    db.update_project(project_id, goal_answers=answers_json, goal_definition=goal_def)

    return {"goal_definition": goal_def, "status": "saved"}


@router.get("/{project_id}/goal")
def get_goal(project_id: str):
    """Get the current goal definition and answers."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    answers = []
    if project.goal_answers:
        try:
            answers = json.loads(project.goal_answers)
        except json.JSONDecodeError:
            pass

    return {
        "answers": answers,
        "goal_definition": project.goal_definition,
        "has_goal": bool(project.goal_definition),
    }


class GoalUpdateRequest(BaseModel):
    goal_definition: str


@router.put("/{project_id}/goal")
def update_goal(project_id: str, body: GoalUpdateRequest):
    """Directly update the goal definition text."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    db.update_project(project_id, goal_definition=body.goal_definition)
    return {"goal_definition": body.goal_definition, "status": "saved"}


@router.post("/{project_id}/generate-prompt")
def generate_prompt(project_id: str, body: GeneratePromptRequest = GeneratePromptRequest()):
    """Use Claude to auto-generate a prompt template from the project description."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    name = body.name or project.name
    description = body.description or project.description

    if not description.strip():
        raise HTTPException(400, "Project description is required to generate a prompt template.")

    try:
        template = prompt_gen.generate_prompt_template(name, description)
        return {"prompt_template": template}
    except Exception as e:
        raise HTTPException(500, f"Failed to generate prompt template: {str(e)}")
