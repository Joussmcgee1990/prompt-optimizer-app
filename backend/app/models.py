"""Pydantic models for the Prompt Optimizer API."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
import uuid


def new_id() -> str:
    return uuid.uuid4().hex[:12]


# --- Projects ---

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=2000)
    prompt_template: str = Field(
        default=(
            "You are a knowledgeable advisor. Answer the following question "
            "based on the provided context. Be specific, accurate, and informative.\n\n"
            "Context:\n{context}\n\nQuestion:\n{question}"
        )
    )


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    prompt_template: Optional[str] = None


class Project(BaseModel):
    id: str
    name: str
    description: str
    prompt_template: str
    kb_status: str = "empty"  # empty | loading | ready
    kb_doc_count: int = 0
    created_at: str = ""
    updated_at: str = ""


# --- Evaluation Items ---

class EvalFact(BaseModel):
    fact: str


class EvalItem(BaseModel):
    question: str
    required_facts: List[str] = Field(..., min_length=1)


class EvalItemsUpdate(BaseModel):
    items: List[EvalItem]


# --- Evaluation Results ---

class FactResult(BaseModel):
    fact: str
    passed: bool
    reason: str


class QuestionResult(BaseModel):
    question: str
    response: str
    score: float
    fact_evaluations: List[FactResult]


class EvalRun(BaseModel):
    id: str
    project_id: str
    prompt_template: str
    score: float
    results: List[QuestionResult]
    failure_reasons: List[dict]
    created_at: str


# --- Optimization ---

class OptimizationRun(BaseModel):
    id: str
    project_id: str
    initial_prompt: str
    final_prompt: str
    initial_score: float
    final_score: float
    iterations: int
    status: str  # running | completed | failed
    created_at: str


# --- Documents ---

class DocumentInfo(BaseModel):
    filename: str
    size: int
    uploaded_at: str
