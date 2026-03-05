"""Optimization engine — runs evaluate→optimize loop, yields progress for SSE.

Uses Opus 4.6 for prompt rewriting (highest-quality reasoning).
"""

from typing import Callable, Dict, Generator, List
from functools import partial

import anthropic
from dotenv import load_dotenv

from .models import MODEL_OPTIMIZE

from .runner import process_single_question

load_dotenv(override=True)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=120.0)
    return _client


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
            yield {"type": "optimizing", "iteration": iteration}

            feedback_str = "\n".join(
                f"- Q: {fr['question']} | Missing fact: {fr['fact']} | Reason: {fr['reason']}"
                for fr in failure_reasons
            )
            current_prompt = optimize_prompt_with_claude(current_prompt, feedback_str, score)

    # Max retries exceeded
    yield {
        "type": "max_retries",
        "final_prompt": current_prompt,
        "final_score": round(score, 3),
        "iterations": max_iterations,
        "failure_reasons": failure_reasons,
    }
