"""Goal Definition Builder — generates clarifying questions and structured goal definitions.

Uses Sonnet 4.6 for question and goal generation (creative generation task).
"""

import json
import re
from typing import List, Dict

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


def generate_goal_questions(project_description: str) -> List[Dict]:
    """
    Analyze the project description and generate 3-5 clarifying questions
    to tighten the goal definition.
    """
    client = _get_client()

    tools = [
        {
            "name": "save_questions",
            "description": "Save the generated goal-clarifying questions",
            "input_schema": {
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "description": "3-5 clarifying questions",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "string",
                                    "description": "Short snake_case ID like 'success_criteria' or 'tone_style'",
                                },
                                "question": {
                                    "type": "string",
                                    "description": "The clarifying question to ask the user",
                                },
                                "hint": {
                                    "type": "string",
                                    "description": "A short hint or example to help the user answer (shown as placeholder text)",
                                },
                                "category": {
                                    "type": "string",
                                    "enum": ["success", "guardrails", "audience", "style", "domain"],
                                    "description": "Category of the question",
                                },
                            },
                            "required": ["id", "question", "hint", "category"],
                        },
                        "minItems": 3,
                        "maxItems": 5,
                    }
                },
                "required": ["questions"],
            },
        }
    ]

    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=1024,
        tools=tools,
        tool_choice={"type": "tool", "name": "save_questions"},
        system=(
            "You are an expert at defining success criteria for AI systems. "
            "Given a project description, generate 3-5 targeted clarifying questions that will "
            "help build a tight goal definition.\n\n"
            "Your questions should cover these areas (pick the most relevant 3-5):\n"
            "1. SUCCESS — What does a perfect response look like? What makes a response 'good enough'?\n"
            "2. GUARDRAILS — What should the AI never do or say? What's off-limits?\n"
            "3. AUDIENCE — Who will be reading the AI's responses? What's their expertise level?\n"
            "4. STYLE — What tone, format, and length are expected?\n"
            "5. DOMAIN — Are there industry-specific rules, compliance requirements, or terminology?\n\n"
            "RULES:\n"
            "- Make questions SPECIFIC to the project description, not generic\n"
            "- Each question should surface information that directly impacts how the AI performs\n"
            "- Hints should be concrete examples, not vague\n"
            "- Skip categories that don't apply to this project"
        ),
        messages=[
            {
                "role": "user",
                "content": f"Generate clarifying questions for this project:\n\n{project_description}",
            },
        ],
    )

    return message.content[0].input["questions"]


def build_goal_definition(
    project_description: str,
    answers: List[Dict],
) -> str:
    """
    Take the project description + user's answers to clarifying questions
    and generate a structured goal definition document.
    """
    client = _get_client()

    # Format answers for the prompt
    qa_text = ""
    for a in answers:
        qa_text += f"Q: {a['question']}\nA: {a['answer']}\n\n"

    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=2048,
        system=(
            "You are creating a structured goal definition document for an AI system. "
            "This document will be the 'north star' that guides knowledge base generation, "
            "evaluation criteria, and prompt optimization.\n\n"
            "Create a Markdown document with these sections:\n"
            "## Mission — One clear sentence describing what this AI must do\n"
            "## Success Criteria — Bullet list of specific, measurable criteria for a good response\n"
            "## Guardrails — What the AI must never do, say, or include\n"
            "## Audience — Who reads the output, their expertise level, what they expect\n"
            "## Response Format — Expected tone, structure, length, and formatting\n"
            "## Domain Rules — Industry-specific requirements, compliance, terminology\n\n"
            "RULES:\n"
            "- Be SPECIFIC — no generic advice, everything tied to this exact project\n"
            "- Every bullet should be actionable and testable\n"
            "- Skip sections that don't apply (but Mission and Success Criteria are always required)\n"
            "- This document will be loaded into a vector database, so make it information-dense"
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Project Description:\n{project_description}\n\n"
                    f"User's Answers to Clarifying Questions:\n{qa_text}\n\n"
                    "Generate the goal definition document."
                ),
            },
        ],
    )

    return message.content[0].text
