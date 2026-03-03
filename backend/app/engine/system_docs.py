"""System Document Generator — auto-generates rubrics, guidelines, and gap analysis.

Uses Sonnet 4.6 for document generation (creative generation task).
"""

import json
from typing import List, Dict, Optional

import anthropic
from dotenv import load_dotenv

from .models import MODEL_GENERATE

load_dotenv(override=True)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def generate_system_docs(
    project_description: str,
    goal_definition: str,
    kb_files: List[Dict],
) -> List[Dict]:
    """
    Analyze the goal definition + KB content and generate system documents
    that fill gaps and improve eval/optimization performance.

    Args:
        project_description: Project description from setup
        goal_definition: Structured goal definition doc
        kb_files: List of {"filename": str, "content": str} from the KB build

    Returns:
        List of {"filename": str, "label": str, "content": str}
    """
    client = _get_client()

    # Build a summary of what's in the KB
    kb_summary = ""
    kb_full = ""
    for f in kb_files:
        if f["filename"] == "00_meta.json":
            continue
        kb_summary += f"- {f['filename']}: {f.get('content', '')[:200]}...\n"
        kb_full += f"\n--- {f['filename']} ---\n{f.get('content', '')[:3000]}\n"

    docs = []

    # 1. Evaluation Rubric
    rubric = _generate_rubric(client, project_description, goal_definition, kb_summary)
    if rubric:
        docs.append({
            "filename": "_system_evaluation_rubric.md",
            "label": "Evaluation Rubric (System)",
            "content": rubric,
        })

    # 2. Response Guidelines
    guidelines = _generate_guidelines(client, project_description, goal_definition, kb_summary)
    if guidelines:
        docs.append({
            "filename": "_system_response_guidelines.md",
            "label": "Response Guidelines (System)",
            "content": guidelines,
        })

    # 3. Gap Analysis (only if KB files exist)
    if kb_files:
        gap = _generate_gap_analysis(client, project_description, goal_definition, kb_full)
        if gap:
            docs.append({
                "filename": "_system_missing_context.md",
                "label": "Missing Context (System)",
                "content": gap,
            })

    return docs


def _generate_rubric(
    client: anthropic.Anthropic,
    project_description: str,
    goal_definition: str,
    kb_summary: str,
) -> str:
    """Generate an evaluation rubric based on the goal definition."""
    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=4096,
        system=(
            "You are creating an evaluation rubric for an AI system's responses. "
            "This rubric will be loaded into the system's vector database so it can "
            "be retrieved as context when generating and evaluating responses.\n\n"
            "Create a Markdown document with:\n"
            "## Scoring Dimensions — 3-5 specific dimensions to evaluate (e.g., accuracy, "
            "completeness, relevance, tone, actionability)\n"
            "## Quality Levels — For each dimension, define what Excellent/Good/Poor looks like "
            "with concrete examples tied to this project\n"
            "## Must-Include Elements — Things every response must contain\n"
            "## Must-Avoid Elements — Things that would make a response fail\n"
            "## Example Assessment — Show how you'd score a hypothetical response\n\n"
            "Be SPECIFIC to this project. No generic rubrics."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Project: {project_description}\n\n"
                f"Goal Definition:\n{goal_definition}\n\n"
                f"Knowledge Base Files:\n{kb_summary}\n\n"
                "Generate the evaluation rubric."
            ),
        }],
    )
    return message.content[0].text


def _generate_guidelines(
    client: anthropic.Anthropic,
    project_description: str,
    goal_definition: str,
    kb_summary: str,
) -> str:
    """Generate response guidelines based on the goal definition."""
    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=4096,
        system=(
            "You are creating response guidelines for an AI system. "
            "These guidelines will be loaded into the system's vector database as "
            "retrievable context that shapes how the AI responds.\n\n"
            "Create a Markdown document with:\n"
            "## Response Structure — Expected format, sections, length\n"
            "## Tone & Voice — How the AI should 'sound' with examples\n"
            "## Information Priority — What info to lead with vs. de-emphasize\n"
            "## Handling Uncertainty — What to do when KB doesn't have the answer\n"
            "## Domain-Specific Rules — Industry terminology, compliance, formatting\n\n"
            "This document should read like an instruction manual for the AI. "
            "Be specific and actionable."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Project: {project_description}\n\n"
                f"Goal Definition:\n{goal_definition}\n\n"
                f"Knowledge Base Files:\n{kb_summary}\n\n"
                "Generate the response guidelines."
            ),
        }],
    )
    return message.content[0].text


def _generate_gap_analysis(
    client: anthropic.Anthropic,
    project_description: str,
    goal_definition: str,
    kb_content: str,
) -> Optional[str]:
    """Analyze KB content vs goal definition and identify gaps."""
    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=4096,
        system=(
            "You are a knowledge base auditor. Compare what the project NEEDS (from the goal) "
            "against what the KB CONTAINS, and identify critical gaps.\n\n"
            "Create a Markdown document with:\n"
            "## Critical Gaps — Information the AI needs but the KB doesn't have. "
            "For each: what's missing, why it matters, and suggested action.\n"
            "## Weak Areas — Topics covered but not deeply enough. "
            "What additional detail would improve responses.\n"
            "## Recommendations — Prioritized list of what to add. "
            "Be specific: 'Add competitor pricing comparison' not 'Add more info'.\n\n"
            "If the KB is comprehensive and has no significant gaps, say so clearly "
            "and keep this document short. Don't manufacture problems."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Project: {project_description}\n\n"
                f"Goal Definition:\n{goal_definition}\n\n"
                f"Knowledge Base Content (truncated):\n{kb_content[:20000]}\n\n"
                "Identify gaps between what the goal requires and what the KB provides."
            ),
        }],
    )

    text = message.content[0].text
    # If Claude says "no gaps", return None to skip this file
    if "no significant gaps" in text.lower() and len(text) < 300:
        return None
    return text
