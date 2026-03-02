"""Optimization engine — runs evaluate→optimize loop, yields progress for SSE."""

from typing import Callable, Dict, Generator, List
from functools import partial

import anthropic
from dotenv import load_dotenv

from .runner import evaluate

load_dotenv()

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def optimize_prompt_with_claude(prompt: str, feedback: str, score: float) -> str:
    """Use Claude to generate an improved prompt based on feedback."""
    client = _get_client()

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        system=(
            "You are an expert prompt engineer. Your task is to improve a RAG prompt template "
            "based on evaluation feedback. The prompt MUST keep the {context} and {question} "
            "placeholders exactly as they are. Focus on making the prompt more specific, "
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

    for iteration in range(1, max_iterations + 1):
        yield {
            "type": "iteration_start",
            "iteration": iteration,
            "prompt": current_prompt,
        }

        # Evaluate
        score, failure_reasons, results = evaluate(query_fn, current_prompt, eval_items)

        yield {
            "type": "iteration_complete",
            "iteration": iteration,
            "score": round(score, 3),
            "failure_count": len(failure_reasons),
            "total_items": len(eval_items),
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
