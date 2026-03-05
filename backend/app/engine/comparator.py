"""Blind A/B comparator — judges two prompts without knowing which is "before" vs "after".

Eliminates confirmation bias by randomly assigning prompts as Output A / Output B,
then having Claude judge them on 4 dimensions without knowing the source.

Uses Opus 4.6 for accurate blind judging.
"""

import random
from typing import Callable, Dict, Generator, List

import anthropic
from dotenv import load_dotenv

from .models import MODEL_EVAL

load_dotenv(override=True)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=120.0)
    return _client


def blind_compare_single(question: str, response_a: str, response_b: str) -> Dict:
    """Use Claude to blindly judge Output A vs Output B on 4 dimensions.

    Returns:
        {
            "dimensions": {"correctness": {"a": 4, "b": 3}, ...},
            "winner": "A" | "B" | "tie",
            "reasoning": "..."
        }
    """
    client = _get_client()

    tools = [
        {
            "name": "record_comparison",
            "description": "Record the blind comparison result between Output A and Output B",
            "input_schema": {
                "type": "object",
                "properties": {
                    "correctness_a": {
                        "type": "integer",
                        "description": "Correctness score for Output A (1-5)",
                        "minimum": 1,
                        "maximum": 5,
                    },
                    "correctness_b": {
                        "type": "integer",
                        "description": "Correctness score for Output B (1-5)",
                        "minimum": 1,
                        "maximum": 5,
                    },
                    "completeness_a": {
                        "type": "integer",
                        "description": "Completeness score for Output A (1-5)",
                        "minimum": 1,
                        "maximum": 5,
                    },
                    "completeness_b": {
                        "type": "integer",
                        "description": "Completeness score for Output B (1-5)",
                        "minimum": 1,
                        "maximum": 5,
                    },
                    "structure_a": {
                        "type": "integer",
                        "description": "Structure & clarity score for Output A (1-5)",
                        "minimum": 1,
                        "maximum": 5,
                    },
                    "structure_b": {
                        "type": "integer",
                        "description": "Structure & clarity score for Output B (1-5)",
                        "minimum": 1,
                        "maximum": 5,
                    },
                    "instruction_adherence_a": {
                        "type": "integer",
                        "description": "Instruction adherence score for Output A (1-5)",
                        "minimum": 1,
                        "maximum": 5,
                    },
                    "instruction_adherence_b": {
                        "type": "integer",
                        "description": "Instruction adherence score for Output B (1-5)",
                        "minimum": 1,
                        "maximum": 5,
                    },
                    "winner": {
                        "type": "string",
                        "enum": ["A", "B", "tie"],
                        "description": "Which output is better overall, or tie if roughly equal",
                    },
                    "reasoning": {
                        "type": "string",
                        "description": "Brief explanation of why one output is better (2-3 sentences)",
                    },
                },
                "required": [
                    "correctness_a", "correctness_b",
                    "completeness_a", "completeness_b",
                    "structure_a", "structure_b",
                    "instruction_adherence_a", "instruction_adherence_b",
                    "winner", "reasoning",
                ],
            },
        }
    ]

    message = client.messages.create(
        model=MODEL_EVAL,
        max_tokens=512,
        tools=tools,
        tool_choice={"type": "tool", "name": "record_comparison"},
        messages=[
            {
                "role": "user",
                "content": (
                    "You are a blind evaluator. Compare two AI-generated answers to the same question. "
                    "You do NOT know which answer is the original or the improved version — judge purely on quality.\n\n"
                    "Score each on 4 dimensions (1-5 scale, 5 = best):\n"
                    "1. **Correctness** — factual accuracy based on the question\n"
                    "2. **Completeness** — how thoroughly it addresses the question\n"
                    "3. **Structure** — clarity, organization, readability\n"
                    "4. **Instruction adherence** — follows the question's intent and constraints\n\n"
                    f"Question: {question}\n\n"
                    f"--- Output A ---\n{response_a}\n\n"
                    f"--- Output B ---\n{response_b}\n\n"
                    "Judge each output on the 4 dimensions, pick an overall winner (or tie), "
                    "and explain your reasoning briefly."
                ),
            },
        ],
    )

    inp = message.content[0].input
    return {
        "dimensions": {
            "correctness": {"a": inp["correctness_a"], "b": inp["correctness_b"]},
            "completeness": {"a": inp["completeness_a"], "b": inp["completeness_b"]},
            "structure": {"a": inp["structure_a"], "b": inp["structure_b"]},
            "instruction_adherence": {"a": inp["instruction_adherence_a"], "b": inp["instruction_adherence_b"]},
        },
        "winner": inp["winner"],
        "reasoning": inp["reasoning"],
    }


def run_comparison(
    query_fn: Callable[[str, str], str],
    prompt_before: str,
    prompt_after: str,
    eval_items: List[Dict],
) -> Generator:
    """Run blind A/B comparison across all eval items.

    For each question:
    1. Generate answers with both prompts via RAG
    2. Randomly assign as Output A / Output B
    3. Have Claude blindly judge
    4. Map winner back to before/after

    Yields SSE events for streaming.
    """
    total = len(eval_items)

    yield {
        "type": "comparison_start",
        "total": total,
        "message": "Starting blind A/B comparison...",
    }

    question_results = []
    after_wins = 0
    before_wins = 0
    ties = 0

    # Aggregate dimension scores
    dim_totals = {
        "correctness": {"before": 0, "after": 0},
        "completeness": {"before": 0, "after": 0},
        "structure": {"before": 0, "after": 0},
        "instruction_adherence": {"before": 0, "after": 0},
    }

    for i, item in enumerate(eval_items):
        question = item["question"]

        yield {
            "type": "comparison_generating",
            "current": i + 1,
            "total": total,
            "question": question,
        }

        # Generate answers with both prompts
        try:
            answer_before = query_fn(prompt_before, question)
            answer_after = query_fn(prompt_after, question)
        except Exception as e:
            question_results.append({
                "question": question,
                "error": str(e),
                "blind_winner": "tie",
                "real_winner": "tie",
                "dimensions": {},
                "reasoning": f"Error generating answers: {e}",
            })
            ties += 1
            continue

        # Random A/B assignment — this is the key to blind comparison
        before_is_a = random.choice([True, False])
        response_a = answer_before if before_is_a else answer_after
        response_b = answer_after if before_is_a else answer_before

        yield {
            "type": "comparison_judging",
            "current": i + 1,
            "total": total,
            "question": question,
        }

        # Blind judge
        try:
            result = blind_compare_single(question, response_a, response_b)
        except Exception as e:
            question_results.append({
                "question": question,
                "error": str(e),
                "blind_winner": "tie",
                "real_winner": "tie",
                "dimensions": {},
                "reasoning": f"Error during judging: {e}",
            })
            ties += 1
            continue

        # Map blind winner back to real identity
        blind_winner = result["winner"]
        if blind_winner == "tie":
            real_winner = "tie"
            ties += 1
        elif (blind_winner == "A" and before_is_a) or (blind_winner == "B" and not before_is_a):
            real_winner = "before"
            before_wins += 1
        else:
            real_winner = "after"
            after_wins += 1

        # Map dimension scores back to before/after
        mapped_dims = {}
        for dim_name, scores in result["dimensions"].items():
            if before_is_a:
                mapped_dims[dim_name] = {"before": scores["a"], "after": scores["b"]}
            else:
                mapped_dims[dim_name] = {"before": scores["b"], "after": scores["a"]}

            dim_totals[dim_name]["before"] += mapped_dims[dim_name]["before"]
            dim_totals[dim_name]["after"] += mapped_dims[dim_name]["after"]

        qr = {
            "question": question,
            "blind_winner": blind_winner,
            "real_winner": real_winner,
            "dimensions": mapped_dims,
            "reasoning": result["reasoning"],
        }
        question_results.append(qr)

        yield {
            "type": "comparison_question_complete",
            "current": i + 1,
            "total": total,
            "question": question,
            "real_winner": real_winner,
            "blind_winner": blind_winner,
            "after_wins": after_wins,
            "before_wins": before_wins,
            "ties": ties,
        }

    # Calculate dimension averages
    dimension_averages = {}
    for dim_name, totals in dim_totals.items():
        count = max(1, total - sum(1 for qr in question_results if "error" in qr))
        dimension_averages[dim_name] = {
            "before": round(totals["before"] / count, 2),
            "after": round(totals["after"] / count, 2),
        }

    # Determine overall winner
    if after_wins > before_wins:
        overall_winner = "after"
    elif before_wins > after_wins:
        overall_winner = "before"
    else:
        overall_winner = "tie"

    yield {
        "type": "comparison_complete",
        "overall_winner": overall_winner,
        "after_wins": after_wins,
        "before_wins": before_wins,
        "ties": ties,
        "dimension_averages": dimension_averages,
        "question_results": question_results,
    }
