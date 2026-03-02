"""FastAPI application — Prompt Optimizer Backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import projects, documents, evaluate, optimize

app = FastAPI(
    title="Prompt Optimizer API",
    description="Auto-tune RAG prompts with evaluation and optimization",
    version="0.1.0",
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(evaluate.router)
app.include_router(optimize.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
