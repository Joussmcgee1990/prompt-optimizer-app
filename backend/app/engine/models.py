"""Central model configuration for the engine.

EVALUATION & OPTIMIZATION use Opus 4.6 — the most capable model for
accurate judgement, scoring, and prompt rewriting.

GENERATION tasks (questions, prompts, goal building) use Sonnet 4.6 —
fast, cost-effective, and more than capable for creative generation work.

KNOWLEDGE BASE BUILDING uses Gemini 2.5 Pro (Deep Research) — Google's
most capable model for deep research synthesis and intelligence analysis.
"""

# ── Critical path: evaluation + optimization ──────────────────────────
MODEL_EVAL = "claude-opus-4-6"        # Fact evaluation, scoring
MODEL_OPTIMIZE = "claude-opus-4-6"    # Prompt rewriting / optimization
MODEL_RAG_ANSWER = "claude-opus-4-6"  # RAG answer generation (evaluated output)

# ── Generation path: content creation ─────────────────────────────────
MODEL_GENERATE = "claude-sonnet-4-6"  # Questions, prompts, goal building

# ── Knowledge base: deep research & intelligence ─────────────────────
MODEL_KB_RESEARCH = "gemini-2.5-pro"  # KB document generation & research synthesis
