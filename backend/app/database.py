"""SQLite database setup and queries."""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from .models import Project, EvalItem, new_id

DB_PATH = Path(__file__).parent.parent / "prompt_optimizer.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            prompt_template TEXT NOT NULL,
            kb_status TEXT DEFAULT 'empty',
            kb_doc_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS eval_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            question TEXT NOT NULL,
            required_facts TEXT NOT NULL  -- JSON array of strings
        );

        CREATE TABLE IF NOT EXISTS eval_runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            prompt_template TEXT NOT NULL,
            score REAL NOT NULL,
            results TEXT NOT NULL,  -- JSON
            failure_reasons TEXT NOT NULL,  -- JSON
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS optimization_runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            initial_prompt TEXT NOT NULL,
            final_prompt TEXT NOT NULL,
            initial_score REAL DEFAULT 0.0,
            final_score REAL DEFAULT 0.0,
            iterations INTEGER DEFAULT 0,
            status TEXT DEFAULT 'running',
            created_at TEXT NOT NULL
        );
    """)
    conn.commit()
    conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Projects ---

def create_project(name: str, description: str, prompt_template: str) -> Project:
    conn = get_db()
    project_id = new_id()
    now = _now()
    conn.execute(
        "INSERT INTO projects (id, name, description, prompt_template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (project_id, name, description, prompt_template, now, now),
    )
    conn.commit()
    conn.close()
    return Project(
        id=project_id, name=name, description=description,
        prompt_template=prompt_template, created_at=now, updated_at=now,
    )


def list_projects() -> List[Project]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
    conn.close()
    return [Project(**dict(r)) for r in rows]


def get_project(project_id: str) -> Optional[Project]:
    conn = get_db()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    return Project(**dict(row)) if row else None


def update_project(project_id: str, **kwargs) -> Optional[Project]:
    conn = get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [_now(), project_id]
    conn.execute(f"UPDATE projects SET {sets}, updated_at = ? WHERE id = ?", vals)
    conn.commit()
    conn.close()
    return get_project(project_id)


# --- Eval Items ---

def save_eval_items(project_id: str, items: List[EvalItem]):
    conn = get_db()
    conn.execute("DELETE FROM eval_items WHERE project_id = ?", (project_id,))
    for item in items:
        conn.execute(
            "INSERT INTO eval_items (project_id, question, required_facts) VALUES (?, ?, ?)",
            (project_id, item.question, json.dumps(item.required_facts)),
        )
    conn.commit()
    conn.close()


def get_eval_items(project_id: str) -> List[EvalItem]:
    conn = get_db()
    rows = conn.execute(
        "SELECT question, required_facts FROM eval_items WHERE project_id = ?",
        (project_id,),
    ).fetchall()
    conn.close()
    return [
        EvalItem(question=r["question"], required_facts=json.loads(r["required_facts"]))
        for r in rows
    ]


# --- Eval Runs ---

def save_eval_run(project_id: str, prompt_template: str, score: float, results: list, failure_reasons: list) -> str:
    conn = get_db()
    run_id = new_id()
    conn.execute(
        "INSERT INTO eval_runs (id, project_id, prompt_template, score, results, failure_reasons, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (run_id, project_id, prompt_template, score, json.dumps(results), json.dumps(failure_reasons), _now()),
    )
    conn.commit()
    conn.close()
    return run_id


def get_eval_runs(project_id: str) -> list:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM eval_runs WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()
    conn.close()
    return [
        {**dict(r), "results": json.loads(r["results"]), "failure_reasons": json.loads(r["failure_reasons"])}
        for r in rows
    ]


# --- Optimization Runs ---

def save_optimization_run(project_id: str, initial_prompt: str) -> str:
    conn = get_db()
    run_id = new_id()
    conn.execute(
        "INSERT INTO optimization_runs (id, project_id, initial_prompt, final_prompt, status, created_at) VALUES (?, ?, ?, '', 'running', ?)",
        (run_id, project_id, initial_prompt, _now()),
    )
    conn.commit()
    conn.close()
    return run_id


def update_optimization_run(run_id: str, **kwargs):
    conn = get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [run_id]
    conn.execute(f"UPDATE optimization_runs SET {sets} WHERE id = ?", vals)
    conn.commit()
    conn.close()


def get_optimization_runs(project_id: str) -> list:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM optimization_runs WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
