"""Evaluation engine — parameterized per-project.

Uses Opus 4.6 for fact evaluation (most accurate judgement model).
"""

from typing import List, Dict, Callable, Generator

import anthropic
from pydantic import BaseModel
from dotenv import load_dotenv

from .models import MODEL_EVAL

load_dotenv(override=True)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=120.0)
    return _client


class FactEvaluation(BaseModel):
    fact: str
    passed: bool
    reason: str = ""


class ResponseEvaluation(BaseModel):
    fact_evaluations: List[FactEvaluation]


def evaluate_single_fact(question: str, response: str, fact: str) -> FactEvaluation:
    """Use Claude tool_use for guaranteed structured output when evaluating a fact."""
    client = _get_client()
    tools = [
        {
            "name": "record_evaluation",
            "description": "Record the result of checking whether a fact is present in an answer",
            "input_schema": {
                "type": "object",
                "properties": {
                    "fact": {"type": "string", "description": "The fact being checked"},
                    "passed": {"type": "boolean", "description": "Whether the fact is present"},
                    "reason": {"type": "string", "description": "Clear explanation for the decision"},
                },
                "required": ["fact", "passed", "reason"],
            },
        }
    ]

    message = client.messages.create(
        model=MODEL_EVAL,
        max_tokens=256,
        tools=tools,
        tool_choice={"type": "tool", "name": "record_evaluation"},
        messages=[
            {
                "role": "user",
                "content": (
                    f"You are an evaluator checking if a specific fact is present in an answer.\n\n"
                    f"Question: {question}\n\nFact to check: {fact}\n\n"
                    f"Answer to evaluate:\n{response}\n\n"
                    f"Determine if this specific fact is present in the answer."
                ),
            },
        ],
    )

    tool_input = message.content[0].input
    return FactEvaluation(**tool_input)


def evaluate_single_response(question: str, response: str, required_facts: List[str]) -> ResponseEvaluation:
    fact_evaluations = []
    for fact in required_facts:
        evaluation = evaluate_single_fact(question, response, fact)
        fact_evaluations.append(evaluation)
    return ResponseEvaluation(fact_evaluations=fact_evaluations)


def process_single_question(
    query_fn: Callable[[str, str], str],
    prompt_template: str,
    item: Dict,
) -> Dict:
    """Evaluate one Q&A pair using a provided query function."""
    question = item["question"]
    response = query_fn(prompt_template, question)

    evaluation = evaluate_single_response(question, response, item["required_facts"])
    passed_count = sum(1 for ev in evaluation.fact_evaluations if ev.passed)

    return {
        "question": question,
        "response": response,
        "score": passed_count / len(item["required_facts"]),
        "fact_evaluations": [ev.model_dump() for ev in evaluation.fact_evaluations],
    }


def evaluate(
    query_fn: Callable[[str, str], str],
    prompt_template: str,
    eval_items: List[Dict],
) -> tuple:
    """
    Evaluate a prompt across all items.

    Args:
        query_fn: A function(prompt_template, question) -> answer_text
        prompt_template: The prompt template with {context} and {question}
        eval_items: List of {"question": str, "required_facts": [str, ...]}

    Returns:
        (total_score, failure_reasons, results)
    """
    evaluated_responses = []
    failure_reasons = []

    for item in eval_items:
        result = process_single_question(query_fn, prompt_template, item)
        evaluated_responses.append(result)

        for ev in result["fact_evaluations"]:
            if not ev["passed"]:
                failure_reasons.append({
                    "question": item["question"],
                    "fact": ev["fact"],
                    "reason": ev["reason"],
                })

    total_score = (
        sum(r["score"] for r in evaluated_responses) / len(evaluated_responses)
        if evaluated_responses
        else 0.0
    )

    return total_score, failure_reasons, evaluated_responses


def evaluate_streaming(
    query_fn: Callable[[str, str], str],
    prompt_template: str,
    eval_items: List[Dict],
) -> Generator:
    """
    Same as evaluate() but yields progress events for SSE streaming.

    Yields dicts like:
        {"type": "progress", "current": 1, "total": 10, "question": "...", "score": 0.67}
        {"type": "complete", "total_score": 0.85, "failure_reasons": [...], "results": [...]}
    """
    evaluated_responses = []
    failure_reasons = []
    total = len(eval_items)

    for i, item in enumerate(eval_items):
        try:
            result = process_single_question(query_fn, prompt_template, item)
        except Exception as e:
            # If one question fails, score it 0 and continue with the rest
            result = {
                "question": item["question"],
                "response": f"Error: {str(e)}",
                "score": 0.0,
                "fact_evaluations": [
                    {"fact": f, "passed": False, "reason": f"Evaluation error: {str(e)}"}
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
            "type": "progress",
            "current": i + 1,
            "total": total,
            "question": item["question"],
            "question_score": result["score"],
            "running_score": round(running_score, 3),
            "fact_evaluations": result["fact_evaluations"],
        }

    total_score = (
        sum(r["score"] for r in evaluated_responses) / len(evaluated_responses)
        if evaluated_responses
        else 0.0
    )

    yield {
        "type": "complete",
        "total_score": round(total_score, 3),
        "failure_reasons": failure_reasons,
        "results": evaluated_responses,
    }
