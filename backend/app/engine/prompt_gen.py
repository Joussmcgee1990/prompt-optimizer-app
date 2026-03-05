"""Generate tailored prompt templates from project descriptions using Claude.

Uses Sonnet 4.6 for initial prompt generation (creative generation task).
"""

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


def generate_prompt_template(project_name: str, project_description: str) -> str:
    """
    Use Claude to generate a tailored prompt template based on the project description.

    Returns a prompt template string with {context} and {question} placeholders.
    """
    client = _get_client()

    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=1024,
        system=(
            "You are an expert at crafting RAG (Retrieval-Augmented Generation) prompt templates. "
            "Your job is to create a highly effective prompt template that will be used to instruct an AI "
            "to answer questions using retrieved context from a knowledge base.\n\n"
            "The template MUST include these exact placeholders:\n"
            "- {context} — where retrieved knowledge base content will be inserted\n"
            "- {question} — where the user's question will be inserted\n\n"
            "CRITICAL: Use ONLY {context} and {question} as placeholders. Do NOT use any other "
            "curly-brace placeholders like {company_name}, {agent_name}, {role}, etc. "
            "Instead, write specific names and roles directly into the template text.\n\n"
            "Guidelines:\n"
            "- Tailor the tone, role, and instructions to match the specific project\n"
            "- Include clear instructions about using only the provided context\n"
            "- Add domain-specific guidance based on the project description\n"
            "- Keep it concise but effective (under 300 words)\n"
            "- Return ONLY the prompt template text, nothing else — no preamble, no explanation"
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Create a tailored RAG prompt template for this project:\n\n"
                    f"Project name: {project_name}\n"
                    f"Description: {project_description}\n\n"
                    f"Return only the prompt template text with {{context}} and {{question}} placeholders."
                ),
            },
        ],
    )

    return message.content[0].text
