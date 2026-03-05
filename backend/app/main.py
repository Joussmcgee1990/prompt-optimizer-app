"""FastAPI application — Prompt Builder & Optimizer Backend."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import projects, documents, evaluate, optimize, knowledge_base, export

app = FastAPI(
    title="Prompt Builder & Optimizer API",
    description="Auto-tune RAG prompts with evaluation and optimization",
    version="0.1.0",
)

# CORS — configurable via CORS_ORIGINS env var (comma-separated)
_default_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "https://frontend-production-15e1.up.railway.app",
    "https://www.vyzn.ai",
    "https://vyzn.ai",
]
_origins = os.environ.get("CORS_ORIGINS", "").split(",") if os.environ.get("CORS_ORIGINS") else _default_origins
_origins = [o.strip() for o in _origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(evaluate.router)
app.include_router(optimize.router)
app.include_router(knowledge_base.router)
app.include_router(export.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
