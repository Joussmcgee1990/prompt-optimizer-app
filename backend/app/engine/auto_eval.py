"""Auto-generate evaluation questions from project knowledge base using Claude.

Uses Sonnet 4.6 for question generation (creative generation task).
"""

import json
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


def generate_eval_questions(
    project_description: str,
    knowledge_sample: str,
    num_questions: int = 5,
    goal_definition: str = "",
) -> List[Dict]:
    """
    Use Claude to auto-generate evaluation questions with required facts.

    Args:
        project_description: What the project is about
        knowledge_sample: Sample text from the knowledge base
        num_questions: How many questions to generate

    Returns:
        List of {"question": str, "required_facts": [str, str, str]}
    """
    client = _get_client()

    tools = [
        {
            "name": "save_eval_questions",
            "description": "Save the generated evaluation questions and their required facts",
            "input_schema": {
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "description": "List of evaluation questions",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question": {
                                    "type": "string",
                                    "description": "A specific question that tests whether the AI can extract and present key information from the knowledge base",
                                },
                                "required_facts": {
                                    "type": "array",
                                    "description": "3 specific facts that MUST appear in a good answer. Each fact should be a concrete, verifiable piece of information from the knowledge base.",
                                    "items": {"type": "string"},
                                    "minItems": 3,
                                    "maxItems": 3,
                                },
                            },
                            "required": ["question", "required_facts"],
                        },
                    }
                },
                "required": ["questions"],
            },
        }
    ]

    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=2048,
        tools=tools,
        tool_choice={"type": "tool", "name": "save_eval_questions"},
        system=(
            "You are an expert at designing evaluation rubrics for AI systems. "
            "Your job is to create questions that test whether an AI assistant can effectively perform "
            "the project's SPECIFIC task using its knowledge base.\n\n"
            "IMPORTANT — Understand the project's purpose first:\n"
            "- Read the PROJECT PURPOSE carefully to understand what the AI is supposed to DO\n"
            "- The knowledge base contains reference material that the AI uses to accomplish its task\n"
            "- Your questions should test the AI's ability to USE that knowledge for its intended purpose\n\n"
            "For example:\n"
            "- If the project is 'evaluate CVs against a hiring rubric', questions should be like "
            "'Given this candidate profile, what score would they get and why?' with required facts "
            "being specific rubric criteria from the KB\n"
            "- If the project is 'answer customer support questions', questions should be realistic "
            "support tickets with required facts being product details from the KB\n"
            "- If the project is 'generate sales outreach', questions should test persona-specific "
            "messaging with required facts being ICP details, pain points, and positioning from the KB\n\n"
            "CRITICAL RULES:\n"
            "- Every question MUST simulate the project's real-world use case\n"
            "- Every required fact MUST come from the actual knowledge base content provided\n"
            "- Do NOT invent or assume facts — only use specific details that actually appear in the content\n"
            "- Questions should test APPLIED knowledge, not just retrieval\n"
            "- The 3 required facts per question should be concrete, verifiable pieces of information "
            "that a correct answer must reference from the knowledge base"
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Generate {num_questions} evaluation questions for this project.\n\n"
                    f"PROJECT PURPOSE:\n{project_description}\n\n"
                    + (f"GOAL DEFINITION:\n{goal_definition}\n\n" if goal_definition else "")
                    + f"KNOWLEDGE BASE CONTENT:\n\n"
                    f"---\n{knowledge_sample[:12000]}\n---\n\n"
                    f"Create {num_questions} diverse questions that:\n"
                    f"1. Simulate real tasks this AI would handle (based on PROJECT PURPOSE"
                    + (" and GOAL DEFINITION" if goal_definition else "") + ")\n"
                    f"2. Require the AI to APPLY knowledge from the KB content to perform its task\n"
                    f"3. Each have exactly 3 required facts extracted from the KB that a correct answer must reference\n"
                    + (f"4. Test the specific success criteria defined in the GOAL DEFINITION\n" if goal_definition else "")
                    + f"\nThe questions should test the AI's ability to do its job, not just recall facts."
                ),
            },
        ],
    )

    tool_input = message.content[0].input
    return tool_input["questions"]


def generate_eval_from_description_only(
    project_description: str,
    num_questions: int = 3,
) -> List[Dict]:
    """
    Generate best-guess eval questions when no knowledge base exists yet.
    Uses just the project description to create reasonable starter questions.
    """
    client = _get_client()

    tools = [
        {
            "name": "save_eval_questions",
            "description": "Save the generated evaluation questions and their required facts",
            "input_schema": {
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question": {
                                    "type": "string",
                                    "description": "A question a typical user would ask about this topic",
                                },
                                "required_facts": {
                                    "type": "array",
                                    "description": "3 facts that should ideally appear in a good answer. Since we don't have the knowledge base yet, make these reasonable expectations.",
                                    "items": {"type": "string"},
                                    "minItems": 3,
                                    "maxItems": 3,
                                },
                            },
                            "required": ["question", "required_facts"],
                        },
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
        tool_choice={"type": "tool", "name": "save_eval_questions"},
        messages=[
            {
                "role": "user",
                "content": (
                    f"Generate {num_questions} starter evaluation questions for an AI assistant project.\n\n"
                    f"Project description: {project_description}\n\n"
                    f"We don't have the knowledge base content yet, so create reasonable questions "
                    f"a real user would ask about this topic. The required facts should be sensible "
                    f"expectations for what a good answer should include — the user will edit these "
                    f"once they've added their actual content."
                ),
            },
        ],
    )

    tool_input = message.content[0].input
    return tool_input["questions"]
