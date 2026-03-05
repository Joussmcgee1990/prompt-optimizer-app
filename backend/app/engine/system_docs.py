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


def stream_system_docs(
    project_description: str,
    goal_definition: str,
    kb_files: List[Dict],
):
    """
    Generator that yields SSE events while generating system documents.
    Same logic as generate_system_docs() but with progress events.
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

    yield {"type": "sysdoc_start", "total_files": 3}

    docs_to_generate = [
        {
            "step": 1,
            "filename": "_system_evaluation_rubric.md",
            "label": "Evaluation Rubric (System)",
            "generator": lambda: _generate_rubric(client, project_description, goal_definition, kb_summary),
        },
        {
            "step": 2,
            "filename": "_system_response_guidelines.md",
            "label": "Response Guidelines (System)",
            "generator": lambda: _generate_guidelines(client, project_description, goal_definition, kb_summary),
        },
        {
            "step": 3,
            "filename": "_system_missing_context.md",
            "label": "Missing Context (System)",
            "generator": lambda: _generate_gap_analysis(client, project_description, goal_definition, kb_full) if kb_files else None,
        },
    ]

    generated = []
    for doc_info in docs_to_generate:
        yield {
            "type": "sysdoc_file_start",
            "step": doc_info["step"],
            "total_steps": 3,
            "filename": doc_info["filename"],
            "label": doc_info["label"],
        }

        try:
            content = doc_info["generator"]()
            if content:
                generated.append({
                    "filename": doc_info["filename"],
                    "label": doc_info["label"],
                    "content": content,
                })
                yield {
                    "type": "sysdoc_file_complete",
                    "step": doc_info["step"],
                    "filename": doc_info["filename"],
                    "label": doc_info["label"],
                    "content": content,
                    "content_length": len(content.encode("utf-8")),
                }
            else:
                yield {
                    "type": "sysdoc_file_skip",
                    "step": doc_info["step"],
                    "filename": doc_info["filename"],
                    "label": doc_info["label"],
                    "reason": "No significant gaps found" if doc_info["step"] == 3 else "No content generated",
                }
        except Exception as e:
            yield {
                "type": "sysdoc_file_error",
                "step": doc_info["step"],
                "filename": doc_info["filename"],
                "error": str(e),
            }

    yield {
        "type": "sysdoc_complete",
        "file_count": len(generated),
        "total_size": sum(len(d["content"].encode("utf-8")) for d in generated),
    }


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
    """Analyze KB content vs goal definition and identify gaps.

    Returns a JSON string with structured gap data that the frontend can render
    as actionable cards. The raw markdown is embedded in the content field.
    """
    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=4096,
        system=(
            "You are a knowledge base auditor. Compare what the project NEEDS (from the goal) "
            "against what the KB CONTAINS, and identify critical gaps.\n\n"
            "Return a JSON object with this exact schema:\n"
            "```json\n"
            "{\n"
            '  "has_gaps": true,\n'
            '  "summary": "One-sentence overview of the KB completeness",\n'
            '  "gaps": [\n'
            "    {\n"
            '      "title": "Short gap title (3-6 words)",\n'
            '      "description": "What\'s missing and why it matters (1-2 sentences)",\n'
            '      "severity": "critical" | "important" | "nice_to_have",\n'
            '      "action_type": "research_url" | "upload_doc" | "manual_input",\n'
            '      "action_hint": "Specific suggestion, e.g. a URL to research or what to upload"\n'
            "    }\n"
            "  ]\n"
            "}\n"
            "```\n\n"
            "Rules:\n"
            "- action_type 'research_url': suggest a specific URL or site to crawl for this info\n"
            "- action_type 'upload_doc': suggest a specific document type the user likely already has\n"
            "- action_type 'manual_input': suggest the user write a brief note or answer a question\n"
            "- Order gaps by severity (critical first)\n"
            "- Maximum 8 gaps. Focus on the most impactful ones.\n"
            "- If the KB is genuinely comprehensive, set has_gaps=false and return an empty gaps array\n"
            "- Don't manufacture problems. Only flag real gaps that would hurt response quality.\n\n"
            "Return ONLY the JSON object — no markdown fences, no explanation."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Project: {project_description}\n\n"
                f"Goal Definition:\n{goal_definition}\n\n"
                f"Knowledge Base Content (truncated):\n{kb_content[:20000]}\n\n"
                "Identify gaps between what the goal requires and what the KB provides. "
                "Return the structured JSON."
            ),
        }],
    )

    text = message.content[0].text.strip()

    # Try to parse as JSON
    try:
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        data = json.loads(text)

        if not data.get("has_gaps", True) or not data.get("gaps"):
            return None

        # Build a markdown document from the structured data for the vector DB
        md_lines = ["# Knowledge Base Gap Analysis\n"]
        md_lines.append(f"**Summary:** {data.get('summary', 'Gap analysis complete.')}\n")

        for gap in data["gaps"]:
            severity_label = {"critical": "🔴 CRITICAL", "important": "🟡 IMPORTANT", "nice_to_have": "🟢 NICE TO HAVE"}.get(gap.get("severity", "important"), "🟡 IMPORTANT")
            md_lines.append(f"\n## {gap['title']} [{severity_label}]")
            md_lines.append(f"\n{gap['description']}")
            action = gap.get("action_type", "manual_input")
            hint = gap.get("action_hint", "")
            if action == "research_url":
                md_lines.append(f"\n**Suggested action:** Research URL — {hint}")
            elif action == "upload_doc":
                md_lines.append(f"\n**Suggested action:** Upload document — {hint}")
            else:
                md_lines.append(f"\n**Suggested action:** Add information — {hint}")

        md_content = "\n".join(md_lines)

        # Embed the structured JSON at the end of the markdown (hidden from display)
        md_content += f"\n\n<!-- GAP_DATA_JSON\n{json.dumps(data, indent=2)}\n-->"

        return md_content

    except (json.JSONDecodeError, KeyError):
        # Fallback: Claude didn't return valid JSON — use raw text
        if "no significant gaps" in text.lower() and len(text) < 300:
            return None
        return text
