"""SQLite database setup and queries."""

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from .models import Project, EvalItem, KBBuild, new_id

# Configurable data dir — defaults to backend/ but can be overridden for Docker volumes
_DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent)))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = _DATA_DIR / "prompt_optimizer.db"


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

        CREATE TABLE IF NOT EXISTS kb_builds (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            mode TEXT NOT NULL DEFAULT 'auto',
            urls_json TEXT NOT NULL DEFAULT '[]',
            user_notes TEXT NOT NULL DEFAULT '',
            slug TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            file_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kb_alignment_items (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            kb_build_id TEXT NOT NULL REFERENCES kb_builds(id) ON DELETE CASCADE,
            question TEXT NOT NULL,
            target_file TEXT NOT NULL,
            user_answer INTEGER DEFAULT NULL,
            correction TEXT DEFAULT '',
            resolved INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS kb_files (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            kb_build_id TEXT NOT NULL REFERENCES kb_builds(id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            size INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
    """)
    conn.commit()

    # Migrations — add columns that may not exist yet
    migrations = [
        "ALTER TABLE projects ADD COLUMN kb_build_status TEXT DEFAULT 'none'",
        "ALTER TABLE projects ADD COLUMN goal_answers TEXT DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN goal_definition TEXT DEFAULT ''",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except sqlite3.OperationalError:
            pass  # column already exists

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


# --- KB Builds ---

def create_kb_build(project_id: str, mode: str, urls: list, user_notes: str, slug: str) -> str:
    conn = get_db()
    build_id = new_id()
    conn.execute(
        "INSERT INTO kb_builds (id, project_id, mode, urls_json, user_notes, slug, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
        (build_id, project_id, mode, json.dumps(urls), user_notes, slug, _now()),
    )
    conn.commit()
    conn.close()
    return build_id


def get_kb_build(build_id: str) -> Optional[KBBuild]:
    conn = get_db()
    row = conn.execute("SELECT * FROM kb_builds WHERE id = ?", (build_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    return KBBuild(
        id=d["id"], project_id=d["project_id"], mode=d["mode"],
        urls=json.loads(d["urls_json"]), user_notes=d["user_notes"],
        slug=d["slug"], status=d["status"], file_count=d["file_count"],
        created_at=d["created_at"],
    )


def update_kb_build(build_id: str, **kwargs):
    conn = get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [build_id]
    conn.execute(f"UPDATE kb_builds SET {sets} WHERE id = ?", vals)
    conn.commit()
    conn.close()


def get_latest_kb_build(project_id: str) -> Optional[KBBuild]:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM kb_builds WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
        (project_id,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    return KBBuild(
        id=d["id"], project_id=d["project_id"], mode=d["mode"],
        urls=json.loads(d["urls_json"]), user_notes=d["user_notes"],
        slug=d["slug"], status=d["status"], file_count=d["file_count"],
        created_at=d["created_at"],
    )


# --- KB Alignment Items ---

def save_alignment_items(project_id: str, kb_build_id: str, items: list):
    conn = get_db()
    conn.execute("DELETE FROM kb_alignment_items WHERE kb_build_id = ?", (kb_build_id,))
    for item in items:
        conn.execute(
            "INSERT INTO kb_alignment_items (id, project_id, kb_build_id, question, target_file) VALUES (?, ?, ?, ?, ?)",
            (new_id(), project_id, kb_build_id, item["question"], item["target_file"]),
        )
    conn.commit()
    conn.close()


def get_alignment_items(kb_build_id: str) -> list:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM kb_alignment_items WHERE kb_build_id = ? ORDER BY rowid",
        (kb_build_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_alignment_item(item_id: str, user_answer: bool, correction: str = "", resolved: bool = False):
    conn = get_db()
    conn.execute(
        "UPDATE kb_alignment_items SET user_answer = ?, correction = ?, resolved = ? WHERE id = ?",
        (1 if user_answer else 0, correction, 1 if resolved else 0, item_id),
    )
    conn.commit()
    conn.close()


# --- KB Files ---

def save_kb_file(project_id: str, kb_build_id: str, filename: str, label: str, content: str) -> str:
    conn = get_db()
    file_id = new_id()
    size = len(content.encode("utf-8"))
    conn.execute(
        "INSERT INTO kb_files (id, project_id, kb_build_id, filename, label, content, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (file_id, project_id, kb_build_id, filename, label, content, size, _now()),
    )
    conn.commit()
    conn.close()
    return file_id


def get_kb_files(project_id: str, kb_build_id: Optional[str] = None) -> list:
    conn = get_db()
    if kb_build_id:
        rows = conn.execute(
            "SELECT id, filename, label, size, created_at FROM kb_files WHERE project_id = ? AND kb_build_id = ? ORDER BY filename",
            (project_id, kb_build_id),
        ).fetchall()
    else:
        # Get files from latest build
        build = get_latest_kb_build(project_id)
        if not build:
            conn.close()
            return []
        rows = conn.execute(
            "SELECT id, filename, label, size, created_at FROM kb_files WHERE kb_build_id = ? ORDER BY filename",
            (build.id,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_kb_file(project_id: str, filename: str, kb_build_id: Optional[str] = None) -> Optional[dict]:
    conn = get_db()
    if kb_build_id:
        row = conn.execute(
            "SELECT * FROM kb_files WHERE project_id = ? AND kb_build_id = ? AND filename = ?",
            (project_id, kb_build_id, filename),
        ).fetchone()
    else:
        build = get_latest_kb_build(project_id)
        if not build:
            conn.close()
            return None
        row = conn.execute(
            "SELECT * FROM kb_files WHERE kb_build_id = ? AND filename = ?",
            (build.id, filename),
        ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_kb_file(project_id: str, filename: str, content: str, kb_build_id: Optional[str] = None) -> bool:
    conn = get_db()
    size = len(content.encode("utf-8"))
    if kb_build_id:
        conn.execute(
            "UPDATE kb_files SET content = ?, size = ? WHERE project_id = ? AND kb_build_id = ? AND filename = ?",
            (content, size, project_id, kb_build_id, filename),
        )
    else:
        build = get_latest_kb_build(project_id)
        if not build:
            conn.close()
            return False
        conn.execute(
            "UPDATE kb_files SET content = ?, size = ? WHERE kb_build_id = ? AND filename = ?",
            (content, size, build.id, filename),
        )
    conn.commit()
    conn.close()
    return True


def get_all_kb_file_contents(project_id: str) -> list:
    """Get all KB file contents for a project (from latest build). Used by RAG and eval."""
    build = get_latest_kb_build(project_id)
    if not build:
        return []
    conn = get_db()
    rows = conn.execute(
        "SELECT filename, label, content, size FROM kb_files WHERE kb_build_id = ? ORDER BY filename",
        (build.id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
