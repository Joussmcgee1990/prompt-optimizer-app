"""Optimization engine — runs evaluate→optimize loop, yields progress for SSE.

Uses Opus 4.6 for prompt rewriting (highest-quality reasoning).
Includes structured failure analysis to make rewrites smarter.
"""

from typing import Callable, Dict, Generator, List
from functools import partial

import anthropic
from dotenv import load_dotenv

from .models import MODEL_OPTIMIZE, MODEL_GENERATE

from .runner import process_single_question

load_dotenv(override=True)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=120.0)
    return _client


def analyze_failures(failures: List[Dict], current_prompt: str) -> Dict:
    """Categorize failures into dimensions with prioritized suggestions.

    Uses Claude Sonnet with tool_use to produce structured analysis.
    Returns: {
        "categories": {
            "instruction_clarity": {"count": N, "patterns": [...], "severity": 1-5},
            ...
        },
        "suggestions": ["...", ...],  # prioritized by impact
        "summary": "..."
    }
    """
    if not failures:
        return {"categories": {}, "suggestions": [], "summary": "No failures to analyze."}

    client = _get_client()

    # Format failures for analysis
    failure_text = "\n".join(
        f"- Q: {f['question']} | Missing: {f['fact']} | Reason: {f['reason']}"
        for f in failures[:20]  # Cap at 20 to manage token usage
    )

    tools = [
        {
            "name": "record_analysis",
            "description": "Record the structured failure analysis results",
            "input_schema": {
                "type": "object",
                "properties": {
                    "instruction_clarity_count": {
                        "type": "integer",
                        "description": "Number of failures caused by unclear or ambiguous instructions in the prompt",
                    },
                    "instruction_clarity_patterns": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific patterns of instruction clarity failures (1-3 items)",
                    },
                    "instruction_clarity_severity": {
                        "type": "integer", "minimum": 1, "maximum": 5,
                        "description": "How severe this category is (1=minor, 5=critical)",
                    },
                    "context_utilization_count": {
                        "type": "integer",
                        "description": "Number of failures where the model didn't properly use provided context",
                    },
                    "context_utilization_patterns": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific patterns of context utilization failures (1-3 items)",
                    },
                    "context_utilization_severity": {
                        "type": "integer", "minimum": 1, "maximum": 5,
                    },
                    "fact_coverage_count": {
                        "type": "integer",
                        "description": "Number of failures where specific facts were missing from answers",
                    },
                    "fact_coverage_patterns": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific patterns of fact coverage failures (1-3 items)",
                    },
                    "fact_coverage_severity": {
                        "type": "integer", "minimum": 1, "maximum": 5,
                    },
                    "guardrails_count": {
                        "type": "integer",
                        "description": "Number of failures related to safety guardrails or scope boundaries",
                    },
                    "guardrails_patterns": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific patterns of guardrail failures (1-3 items)",
                    },
                    "guardrails_severity": {
                        "type": "integer", "minimum": 1, "maximum": 5,
                    },
                    "format_style_count": {
                        "type": "integer",
                        "description": "Number of failures related to response format or style issues",
                    },
                    "format_style_patterns": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific patterns of format/style failures (1-3 items)",
                    },
                    "format_style_severity": {
                        "type": "integer", "minimum": 1, "maximum": 5,
                    },
                    "suggestion_1": {
                        "type": "string",
                        "description": "Highest-priority suggestion for improving the prompt",
                    },
                    "suggestion_2": {
                        "type": "string",
                        "description": "Second-priority suggestion for improving the prompt",
                    },
                    "suggestion_3": {
                        "type": "string",
                        "description": "Third-priority suggestion for improving the prompt",
                    },
                    "summary": {
                        "type": "string",
                        "description": "One-sentence summary of the main failure patterns",
                    },
                },
                "required": [
                    "instruction_clarity_count", "instruction_clarity_patterns", "instruction_clarity_severity",
                    "context_utilization_count", "context_utilization_patterns", "context_utilization_severity",
                    "fact_coverage_count", "fact_coverage_patterns", "fact_coverage_severity",
                    "guardrails_count", "guardrails_patterns", "guardrails_severity",
                    "format_style_count", "format_style_patterns", "format_style_severity",
                    "suggestion_1", "suggestion_2", "suggestion_3", "summary",
                ],
            },
        }
    ]

    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=1024,
        tools=tools,
        tool_choice={"type": "tool", "name": "record_analysis"},
        messages=[
            {
                "role": "user",
                "content": (
                    "Analyze these RAG prompt evaluation failures and categorize them.\n\n"
                    f"Current prompt:\n---\n{current_prompt}\n---\n\n"
                    f"Failures:\n{failure_text}\n\n"
                    "Categorize each failure into one of these dimensions:\n"
                    "1. instruction_clarity — prompt instructions are unclear or ambiguous\n"
                    "2. context_utilization — model fails to properly use the retrieved context\n"
                    "3. fact_coverage — specific facts are missing from answers\n"
                    "4. guardrails — scope boundary or safety issues\n"
                    "5. format_style — response format or style doesn't match expectations\n\n"
                    "Provide counts, patterns, severity (1-5), and 3 prioritized improvement suggestions."
                ),
            },
        ],
    )

    inp = message.content[0].input

    categories = {}
    for cat in ["instruction_clarity", "context_utilization", "fact_coverage", "guardrails", "format_style"]:
        count = inp.get(f"{cat}_count", 0)
        if count > 0:
            categories[cat] = {
                "count": count,
                "patterns": inp.get(f"{cat}_patterns", []),
                "severity": inp.get(f"{cat}_severity", 1),
            }

    suggestions = [
        s for s in [
            inp.get("suggestion_1", ""),
            inp.get("suggestion_2", ""),
            inp.get("suggestion_3", ""),
        ] if s
    ]

    return {
        "categories": categories,
        "suggestions": suggestions,
        "summary": inp.get("summary", ""),
    }


def _format_structured_feedback(analysis: Dict, raw_failures: List[Dict]) -> str:
    """Format structured analysis into a clear prompt for the rewriter."""
    parts = []

    if analysis.get("summary"):
        parts.append(f"SUMMARY: {analysis['summary']}")

    if analysis.get("categories"):
        parts.append("\nFAILURE CATEGORIES (by severity):")
        sorted_cats = sorted(
            analysis["categories"].items(),
            key=lambda x: x[1]["severity"],
            reverse=True,
        )
        for cat_name, cat_data in sorted_cats:
            label = cat_name.replace("_", " ").title()
            parts.append(f"\n  [{label}] — {cat_data['count']} failures, severity {cat_data['severity']}/5")
            for pattern in cat_data.get("patterns", []):
                parts.append(f"    • {pattern}")

    if analysis.get("suggestions"):
        parts.append("\nPRIORITIZED SUGGESTIONS:")
        for i, suggestion in enumerate(analysis["suggestions"], 1):
            parts.append(f"  {i}. {suggestion}")

    # Also include raw failures for specifics
    if raw_failures:
        parts.append(f"\nRAW FAILURES ({len(raw_failures)} total):")
        for fr in raw_failures[:10]:
            parts.append(f"  - Q: {fr['question']} | Missing: {fr['fact']}")

    return "\n".join(parts)


def optimize_prompt_with_claude(prompt: str, feedback: str, score: float) -> str:
    """Use Claude to generate an improved prompt based on feedback."""
    client = _get_client()

    message = client.messages.create(
        model=MODEL_OPTIMIZE,
        max_tokens=2048,
        system=(
            "You are an expert prompt engineer. Your task is to improve a RAG prompt template "
            "based on evaluation feedback. The prompt MUST keep the {context} and {question} "
            "placeholders exactly as they are. Do NOT introduce any other curly-brace placeholders "
            "like {company_name}, {agent_name}, {role}, etc. — write specific names and roles "
            "directly into the prompt text. Focus on making the prompt more specific, "
            "adding relevant instructions, and addressing the failure patterns."
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Here is the current prompt (scoring {score:.2f} out of 1.0):\n\n"
                    f"---\n{prompt}\n---\n\n"
                    f"Here are the failure reasons:\n{feedback}\n\n"
                    f"Please write an improved version of this prompt that addresses "
                    f"these failures. Keep the {{context}} and {{question}} placeholders. "
                    f"Return ONLY the improved prompt, nothing else."
                ),
            },
        ],
    )
    return message.content[0].text


def run_optimization(
    query_fn: Callable[[str, str], str],
    prompt_template: str,
    eval_items: List[Dict],
    max_iterations: int = 3,
    target_score: float = 0.8,
) -> Generator:
    """
    Run the evaluate→optimize loop. Yields progress events for SSE.

    Yields:
        {"type": "iteration_start", "iteration": 1, "prompt": "..."}
        {"type": "eval_progress", "iteration": 1, "current": 1, "total": 10, ...}
        {"type": "iteration_complete", "iteration": 1, "score": 0.45, "feedback": "..."}
        {"type": "optimizing", "iteration": 1}
        {"type": "complete", "final_prompt": "...", "final_score": 0.85, "iterations": 2}
        {"type": "max_retries", "final_prompt": "...", "final_score": 0.65, "iterations": 3}
    """
    current_prompt = prompt_template
    total_questions = len(eval_items)

    for iteration in range(1, max_iterations + 1):
        yield {
            "type": "iteration_start",
            "iteration": iteration,
            "total_questions": total_questions,
            "prompt": current_prompt,
        }

        # Evaluate with per-question progress
        evaluated_responses = []
        failure_reasons = []

        for qi, item in enumerate(eval_items):
            try:
                result = process_single_question(query_fn, current_prompt, item)
            except Exception as e:
                # If one question fails (timeout, network), score it 0 and continue
                result = {
                    "question": item["question"],
                    "response": f"Error: {str(e)}",
                    "score": 0.0,
                    "fact_evaluations": [
                        {"fact": f, "passed": False, "reason": f"Error: {str(e)}"}
                        for f in item["required_facts"]
                    ],
                }
            evaluated_responses.append(result)

            for ev in result["fact_evaluations"]:
                if not ev["passed"]:
                    failure_reasons.append({
                        "question": item["question"],
                        "fact": ev["fact"],
                        "reason": ev["reason"],
                    })

            running_score = (
                sum(r["score"] for r in evaluated_responses) / len(evaluated_responses)
            )

            yield {
                "type": "eval_progress",
                "iteration": iteration,
                "current": qi + 1,
                "total": total_questions,
                "question": item["question"],
                "question_score": result["score"],
                "running_score": round(running_score, 3),
            }

        score = (
            sum(r["score"] for r in evaluated_responses) / len(evaluated_responses)
            if evaluated_responses else 0.0
        )

        yield {
            "type": "iteration_complete",
            "iteration": iteration,
            "score": round(score, 3),
            "failure_count": len(failure_reasons),
            "total_items": total_questions,
        }

        if score >= target_score:
            yield {
                "type": "complete",
                "final_prompt": current_prompt,
                "final_score": round(score, 3),
                "iterations": iteration,
                "failure_reasons": failure_reasons,
            }
            return

        if iteration < max_iterations:
            # Phase 1: Analyze failures
            yield {"type": "analyzing", "iteration": iteration}

            try:
                analysis = analyze_failures(failure_reasons, current_prompt)
            except Exception:
                analysis = {"categories": {}, "suggestions": [], "summary": "Analysis unavailable."}

            yield {
                "type": "analysis_complete",
                "iteration": iteration,
                "analysis": analysis,
            }

            # Phase 2: Rewrite prompt using structured feedback
            yield {"type": "optimizing", "iteration": iteration}

            feedback_str = _format_structured_feedback(analysis, failure_reasons)
            current_prompt = optimize_prompt_with_claude(current_prompt, feedback_str, score)

    # Max retries exceeded
    yield {
        "type": "max_retries",
        "final_prompt": current_prompt,
        "final_score": round(score, 3),
        "iterations": max_iterations,
        "failure_reasons": failure_reasons,
    }
