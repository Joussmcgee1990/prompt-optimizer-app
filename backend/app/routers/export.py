"""Export project as a downloadable zip package."""

import io
import json
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .. import database as db

router = APIRouter(prefix="/api/projects/{project_id}", tags=["export"])


@router.get("/export")
def export_project(project_id: str):
    """Export project as a zip containing prompt, KB files, eval rubric, and metadata."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    buf = io.BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Prompt template
        zf.writestr("prompt.txt", project.prompt_template or "")

        # 2. Knowledge base files from DB
        kb_files = db.get_all_kb_file_contents(project_id)
        for kf in kb_files:
            zf.writestr(f"knowledge_base/{kf['filename']}", kf["content"])

        # 3. Eval rubric
        eval_items = db.get_eval_items(project_id)
        if eval_items:
            rubric = [item.model_dump() for item in eval_items]
            zf.writestr("eval_rubric.json", json.dumps(rubric, indent=2))

        # 4. Metadata
        eval_runs = db.get_eval_runs(project_id)
        opt_runs = db.get_optimization_runs(project_id)

        latest_eval_score = eval_runs[0]["score"] if eval_runs else None
        latest_opt = opt_runs[0] if opt_runs else None

        metadata = {
            "project_name": project.name,
            "description": project.description,
            "kb_build_status": getattr(project, "kb_build_status", "unknown"),
            "kb_file_count": len(kb_files),
            "eval_question_count": len(eval_items),
            "latest_eval_score": latest_eval_score,
            "optimization_runs": len(opt_runs),
            "latest_optimization": {
                "initial_score": latest_opt["initial_score"],
                "final_score": latest_opt["final_score"],
                "iterations": latest_opt["iterations"],
                "status": latest_opt["status"],
            } if latest_opt else None,
            "exported_at": datetime.now(timezone.utc).isoformat(),
        }
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

    buf.seek(0)

    slug = project.name.lower().replace(" ", "_")[:40]
    filename = f"{slug}_export.zip"

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
