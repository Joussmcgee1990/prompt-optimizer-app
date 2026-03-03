"""Knowledge Base Builder — fetches URLs, generates 8 structured intelligence files, yields SSE events.

Produces organisational intelligence: strategic context, power mapping, leadership
profiles, cultural signals, risk indicators, and synthesised briefing documents.

Uses Gemini 2.5 Pro (Deep Research) for KB document generation.
"""

import json
import os
import re
from datetime import datetime, timezone
from typing import Generator, List

from .research import deep_crawl_site, fetch_url_content, synthesize_research

_anthropic_client = None
_gemini_client = None


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        from dotenv import load_dotenv
        load_dotenv(override=True)
        _anthropic_client = anthropic.Anthropic()
    return _anthropic_client


def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        from dotenv import load_dotenv
        load_dotenv(override=True)
        _gemini_client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
    return _gemini_client


def _slugify(name: str) -> str:
    """Convert project name to a filesystem-safe slug."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", name.lower()).strip("_")
    return slug[:60] or "project"


# --- File generation specs ---

KB_FILES = [
    # ── Research Pillar 1: Strategic Context ──────────────────────────────
    {
        "filename": "01_strategic_context.md",
        "label": "Strategic Context",
        "system": (
            "You are a strategic intelligence analyst building a foundational company profile. "
            "This document establishes the structural and strategic reality of the organisation — "
            "NOT a marketing overview, but an intelligence picture.\n\n"
            "Required sections (use ## headings):\n"
            "## Company Identity — official name, legal structure, founding date, HQ, key locations\n"
            "## Ownership & Capital Structure — ownership model (founder-led, PE-backed, public, "
            "family-owned, co-op, etc.), known investors, funding rounds, valuations, "
            "debt indicators, capital constraints or runway signals\n"
            "## Business Model — how they make money, revenue streams, pricing model, "
            "delivery model (SaaS, service, hybrid), unit economics signals\n"
            "## Company Stage — startup / scale-up / mature / turnaround / decline, "
            "with evidence for the assessment\n"
            "## Recent Strategic Events — acquisitions, divestitures, pivots, restructures, "
            "market entries/exits, leadership changes, layoffs, funding events (last 24 months)\n"
            "## Competitive Landscape — who they position against, market category, "
            "stated differentiators, observable competitive dynamics\n"
            "## Products & Market — products/services (factual, not promotional), "
            "target markets, industries, customer segments, named customers\n\n"
            "INTELLIGENCE RULES:\n"
            "- Distinguish between what the company SAYS and observable reality\n"
            "- Mark inferences clearly with [INFERRED]\n"
            "- If information is absent, write 'NOT FOUND — needs further research'\n"
            "- Include source page URLs for key claims\n"
            "- Minimum 800 words. Depth over breadth."
        ),
    },
    # ── Research Pillar 2: Power Mapping & Governance ─────────────────────
    {
        "filename": "02_power_governance.md",
        "label": "Power & Governance",
        "system": (
            "You are an organisational intelligence analyst mapping power structures and "
            "governance dynamics. This document reveals how decisions actually get made.\n\n"
            "Required sections:\n"
            "## Formal Leadership Structure — C-suite, VPs, directors with titles and reporting "
            "lines where visible. Include board members and their affiliations.\n"
            "## Board & Investor Influence — board composition, investor representation, "
            "PE operating partners, VC board seats. Assess how much influence investors exert "
            "on operations vs. staying hands-off [INFERRED where necessary].\n"
            "## Decision-Making Signals — any evidence of centralised vs. distributed "
            "decision-making. Speed indicators. Bureaucracy signals. Approval chains.\n"
            "## Political Fault Lines — potential tensions between: founder vs. board, "
            "sales vs. product, old guard vs. new hires, HQ vs. regional offices. "
            "Look for structural conditions that CREATE political friction.\n"
            "## Key Gatekeepers — who likely controls access to the top decision-maker? "
            "Chief of Staff, EA, VP-level filters. [INFERRED]\n"
            "## Governance & Compliance — regulatory frameworks, compliance certifications, "
            "committee structures, advisory boards mentioned.\n\n"
            "INTELLIGENCE RULES:\n"
            "- Map ACTUAL power, not just org chart titles\n"
            "- A PE-backed company has different power dynamics than a founder-led one — reflect this\n"
            "- Mark all inferences with [INFERRED] and explain your reasoning\n"
            "- Where information is absent, note the gap and its significance\n"
            "- This is intelligence analysis, not HR documentation"
        ),
        "depends_on": ["01_strategic_context.md"],
    },
    # ── Research Pillar 3: Key People Profiling ───────────────────────────
    {
        "filename": "03_leadership_profiles.md",
        "label": "Leadership Profiles",
        "system": (
            "You are a leadership intelligence analyst building deep profiles of key decision-makers. "
            "For EVERY named leader found in the source material, create a detailed profile card.\n\n"
            "For each person (use ## heading with their name and title):\n\n"
            "### Background Pattern\n"
            "- Career trajectory — previous companies, roles, industries, progression speed\n"
            "- Education — institutions, degrees, notable programmes (MBA, military, technical)\n"
            "- Pattern recognition — are they a builder, optimizer, turnaround specialist, "
            "career politician, technical founder, commercial operator?\n"
            "- Tenure at current company and in current role\n\n"
            "### Cognitive & Decision Style [INFERRED]\n"
            "- Likely thinking style based on background: analytical/intuitive, "
            "data-driven/narrative, fast/deliberate, risk-seeking/risk-averse\n"
            "- Evidence: what in their background or public statements suggests this?\n"
            "- How they likely process information and make decisions\n\n"
            "### Communication Style [INFERRED]\n"
            "- Based on their background and any public statements/writing:\n"
            "- Likely formality level, preferred format, attention span indicators\n"
            "- What resonates: data, stories, peer validation, competitive pressure, vision\n"
            "- What to avoid: what would alienate this person?\n\n"
            "### Incentive Structure [INFERRED]\n"
            "- What is this person likely measured on? What does success look like for them?\n"
            "- Equity/compensation signals based on role and company stage\n"
            "- Career trajectory incentives — what's their likely next move?\n"
            "- Time horizon — thinking in quarters, years, or decades?\n\n"
            "### Psychological Markers [INFERRED]\n"
            "- Status sensitivity signals (title inflation, public speaking, awards)\n"
            "- Control orientation — hands-on operator or delegator?\n"
            "- Risk tolerance indicators from career moves and company choices\n"
            "- Likely stress points and pressure responses\n\n"
            "GUARDRAILS:\n"
            "- EVERY inference must be marked [INFERRED] with reasoning\n"
            "- Do NOT make clinical or diagnostic claims — use 'likely', 'suggests', 'indicators'\n"
            "- Avoid defamatory assumptions — stick to evidence-based pattern analysis\n"
            "- Flag low-confidence assessments explicitly\n"
            "- If only 1-2 people are found, note this as a significant intelligence gap"
        ),
        "depends_on": ["01_strategic_context.md", "02_power_governance.md"],
    },
    # ── Research Pillar 4: Cultural & Organisational Signals ──────────────
    {
        "filename": "04_cultural_signals.md",
        "label": "Cultural & Org Signals",
        "system": (
            "You are an organisational culture analyst reading between the lines of company "
            "communications to build an honest cultural assessment.\n\n"
            "Required sections:\n"
            "## Decision Culture — top-down command vs. distributed autonomy? "
            "Evidence: job descriptions, leadership messaging, org structure signals.\n"
            "## Execution vs. Innovation — is this an execution-focused culture (process, "
            "efficiency, repeatability) or innovation-focused (experimentation, speed, pivots)? "
            "Evidence: product cadence, messaging, hiring patterns.\n"
            "## Data vs. Personality — do they lead with data and metrics, or with vision "
            "and charisma? Evidence: website language, case study style, leadership profiles.\n"
            "## Transparency Level — how open is the company? Evidence: blog content, "
            "financial disclosure, leadership accessibility, Glassdoor signals.\n"
            "## Hiring Patterns — what roles are they hiring for? What does the hiring "
            "volume and type tell you about priorities, growth areas, and pain points? "
            "Engineering-heavy? Sales-heavy? Leadership hiring = restructure?\n"
            "## Internal Communication Signals — formal/informal, corporate/startup, "
            "jargon-heavy/plain-speaking. What does the language tell you about the culture?\n"
            "## Values Alignment — stated values vs. observable behaviour. "
            "Do their actions match their words? Where are the gaps?\n"
            "## Change Readiness — based on all cultural signals, how open is this "
            "organisation to transformation? Rate: High/Medium/Low with reasoning.\n\n"
            "INTELLIGENCE RULES:\n"
            "- Read BETWEEN the lines — what they don't say is as important as what they do\n"
            "- A company that says 'we move fast' but has 12 approval layers is telling you something\n"
            "- Mark all inferences with [INFERRED]\n"
            "- Be honest about what you can and can't determine from website data alone\n"
            "- This is diagnostic, not promotional"
        ),
        "depends_on": ["01_strategic_context.md", "02_power_governance.md"],
    },
    # ── Research Pillar 5: Risk & Pressure Indicators ─────────────────────
    {
        "filename": "05_risk_indicators.md",
        "label": "Risk & Pressure",
        "system": (
            "You are a risk intelligence analyst identifying organisational pressure points "
            "and structural vulnerabilities. This is NOT a credit risk assessment — it's an "
            "intelligence picture of where tensions, fragilities, and pressures exist.\n\n"
            "Required sections:\n"
            "## Financial Pressure Signals — debt indicators, burn rate signals, "
            "pricing changes, cost-cutting evidence, fundraising urgency [INFERRED where needed]\n"
            "## Revenue Concentration Risk — is the business dependent on a few large customers, "
            "a single product line, or one market? Evidence from case studies, logos, messaging.\n"
            "## Regulatory & Compliance Exposure — what regulations affect them? "
            "How well-prepared do they appear? Any compliance gaps visible?\n"
            "## Leadership & Succession Risk — key-person dependency, founder risk, "
            "recent departures, thin leadership bench. Single points of failure.\n"
            "## Market & Competitive Threats — competitive pressures, market shifts, "
            "technology disruption risks, commoditisation signals.\n"
            "## Operational Fragilities — technology debt signals, scaling challenges, "
            "integration complexity, vendor dependencies.\n"
            "## Founder/CEO Fatigue Signals [INFERRED] — tenure length, public energy levels, "
            "messaging shifts from vision to operational detail, delegation patterns.\n"
            "## Structural Tensions — where do the incentives of different stakeholders "
            "conflict? (e.g., PE wants exit vs. founder wants to build; sales promises vs. "
            "product reality; growth targets vs. team capacity)\n\n"
            "For each risk, assess:\n"
            "- **Severity**: Critical / High / Medium / Low\n"
            "- **Confidence**: How sure are you? High / Medium / Low\n"
            "- **Evidence**: What supports this assessment?\n\n"
            "GUARDRAILS:\n"
            "- Never present inference as fact\n"
            "- Flag low-confidence assessments prominently\n"
            "- Avoid alarmist language — be measured and analytical\n"
            "- If risks are genuinely not visible, say so honestly"
        ),
        "depends_on": ["01_strategic_context.md", "02_power_governance.md"],
    },
    # ── Output: Intelligence Brief (Executive Summary) ────────────────────
    {
        "filename": "06_intelligence_brief.md",
        "label": "Intelligence Brief",
        "system": (
            "You are a senior intelligence analyst writing a concise executive briefing document. "
            "Synthesise ALL previous research into a single, dense, actionable intelligence brief.\n\n"
            "This is the ONE document someone reads to understand this organisation quickly.\n\n"
            "Required sections:\n"
            "## Organisation Summary — 3-4 sentences: what they are, how big, what stage, "
            "who owns them, what they sell, to whom.\n"
            "## Strategic Position — where they sit in their market, key strengths and "
            "vulnerabilities, trajectory (growing/stable/declining).\n"
            "## How Decisions Get Made — who holds real power, how fast do decisions move, "
            "what gets prioritised, who can block.\n"
            "## Key People — the 3-5 most important people to understand, with one-line "
            "characterisations (e.g., 'Data-driven CFO, ex-McKinsey, controls budget tightly').\n"
            "## Where Tensions Sit — the 2-3 most significant internal pressures or conflicts.\n"
            "## Risk Summary — the top risks in priority order.\n"
            "## Confidence Assessment — what we know well, what's thin, what's missing entirely.\n\n"
            "RULES:\n"
            "- Maximum 1,500 words — this is a BRIEF, not a report\n"
            "- Every sentence should convey intelligence value — no filler\n"
            "- Write for someone who needs to walk into a meeting with this company in 30 minutes\n"
            "- Distinguish fact from inference throughout\n"
            "- End with a clear 'BOTTOM LINE' — one paragraph that captures the essential truth"
        ),
        "depends_on": [
            "01_strategic_context.md", "02_power_governance.md",
            "03_leadership_profiles.md", "04_cultural_signals.md",
            "05_risk_indicators.md",
        ],
    },
    # ── Output: Power Map & Risk Flags ────────────────────────────────────
    {
        "filename": "07_power_map_and_risks.md",
        "label": "Power Map & Risk Flags",
        "system": (
            "You are an organisational intelligence analyst creating two structured reference "
            "documents: a power map and a risk flag register.\n\n"
            "## PART 1: POWER MAP\n\n"
            "### Formal Hierarchy\n"
            "Reconstruct the org chart as far as possible from available information. "
            "Use a text-based tree structure. Mark uncertain positions with [?].\n\n"
            "### Informal Influence Lines\n"
            "Who has influence beyond their title? Founder's trusted lieutenants, "
            "long-tenured operators, board-connected insiders. Map these with reasoning.\n\n"
            "### Investor & Board Overlay\n"
            "Which investors/board members have operational influence? "
            "How does the capital structure affect who has real power?\n\n"
            "### Decision Flow\n"
            "For a significant purchase/partnership decision, trace the likely path: "
            "Who initiates? → Who evaluates? → Who influences? → Who approves? → Who can block?\n\n"
            "### Political Dynamics\n"
            "Where are the likely alliances and tensions? "
            "Which factions exist? What drives the political landscape?\n\n"
            "---\n\n"
            "## PART 2: RISK FLAGS\n\n"
            "Create a structured risk register. For each flag:\n\n"
            "| Risk | Category | Severity | Confidence | Evidence | Implication |\n\n"
            "Categories: Financial, Leadership, Operational, Market, Regulatory, Structural\n"
            "Severity: Critical / High / Medium / Low\n"
            "Confidence: Confirmed / Probable / Possible / Speculative\n\n"
            "After the table, write a 'WATCH LIST' — 3-5 things that aren't risks yet "
            "but could become risks. What early warning signals should be monitored?\n\n"
            "GUARDRAILS:\n"
            "- Label every inference\n"
            "- Avoid defamatory assumptions about individuals\n"
            "- Be measured — not every gap is a crisis\n"
            "- Distinguish between structural risks and speculative concerns"
        ),
        "depends_on": [
            "01_strategic_context.md", "02_power_governance.md",
            "03_leadership_profiles.md", "05_risk_indicators.md",
        ],
    },
    # ── KB Index & Quality Assessment ─────────────────────────────────────
    {
        "filename": "99_kb_index.md",
        "label": "KB Index & Gaps",
        "system": (
            "You are an intelligence quality auditor assessing this knowledge base.\n\n"
            "Required sections:\n"
            "## File Index — list each KB file with a 2-sentence summary of what it covers "
            "and the depth of intelligence available.\n\n"
            "## Confidence Matrix — for each assessment category, rate confidence:\n"
            "| Category | Confidence | Key Gaps |\n"
            "Categories: Strategic Context, Capital Structure, Governance & Ownership, "
            "Executive Psychology & Style, Power & Influence Mapping, Cultural Stability, "
            "External Market Threats, Change Readiness\n"
            "Confidence: High (well-evidenced) / Medium (partial evidence + inference) / "
            "Low (mostly inferred) / Nil (no data)\n\n"
            "## Critical Intelligence Gaps — what information is MISSING that would "
            "significantly improve the intelligence picture? Prioritise by impact.\n\n"
            "## Source Quality Assessment — how reliable is the source material? "
            "Website-only research has inherent limitations. What biases exist in the data? "
            "(e.g., company self-reporting is always optimistic)\n\n"
            "## Recommended Next Steps — prioritised actions to fill gaps:\n"
            "- What public sources should be checked? (LinkedIn, Glassdoor, Companies House, "
            "SEC filings, press coverage, industry reports)\n"
            "- What questions need answers from human intelligence?\n"
            "- What would upgrade the confidence level on key assessments?\n\n"
            "## Overall Intelligence Rating — score 1-10 with specific reasoning. "
            "What would need to be added to reach a 9 or 10?"
        ),
        "depends_on": [
            "01_strategic_context.md", "02_power_governance.md",
            "03_leadership_profiles.md", "04_cultural_signals.md",
            "05_risk_indicators.md", "06_intelligence_brief.md",
            "07_power_map_and_risks.md",
        ],
    },
]


def _generate_file(
    spec: dict,
    master_context: str,
    prior_files: dict[str, str],
) -> str:
    """Generate a single KB file using Gemini 2.5 Pro (Deep Research)."""
    client = _get_gemini_client()

    # Build context from dependencies
    dep_context = ""
    for dep in spec.get("depends_on", []):
        if dep in prior_files:
            dep_context += f"\n\n--- {dep} ---\n{prior_files[dep]}"

    user_content = f"Source material:\n\n{master_context}"
    if dep_context:
        user_content += f"\n\nPreviously generated KB files for reference:{dep_context}"
    user_content += (
        f"\n\nPlease generate the '{spec['label']}' document. "
        "Return ONLY the Markdown document content, nothing else."
    )

    from google import genai as _genai
    from .models import MODEL_KB_RESEARCH, MODEL_GENERATE

    # Try Gemini first, fall back to Claude if quota exhausted
    try:
        response = client.models.generate_content(
            model=MODEL_KB_RESEARCH,
            contents=user_content,
            config=_genai.types.GenerateContentConfig(
                system_instruction=spec["system"],
                max_output_tokens=8192,
            ),
        )
        return response.text
    except Exception as e:
        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            # Gemini quota exhausted — fall back to Claude
            claude = _get_anthropic_client()
            message = claude.messages.create(
                model=MODEL_GENERATE,
                max_tokens=8192,
                system=spec["system"],
                messages=[{"role": "user", "content": user_content}],
            )
            return message.content[0].text
        raise


def _generate_alignment_questions(
    master_context: str,
    generated_files: dict[str, str],
) -> list[dict]:
    """Generate 2-3 YES/NO alignment questions."""
    client = _get_anthropic_client()

    files_summary = "\n".join(
        f"- {name}: {content[:200]}..."
        for name, content in generated_files.items()
        if name != "00_meta.json"
    )

    from .models import MODEL_GENERATE

    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=1024,
        system=(
            "You generate alignment verification questions for a knowledge base. "
            "Create 2-3 YES/NO questions that verify the most critical facts. "
            "Each question should be answerable with YES or NO. "
            "Focus on facts that, if wrong, would make the entire KB unreliable. "
            "Return valid JSON array only."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Source material:\n{master_context[:5000]}\n\n"
                f"Generated KB files:\n{files_summary}\n\n"
                "Generate 2-3 YES/NO alignment questions. Return as JSON array:\n"
                '[{"question": "Is X correct?", "target_file": "01_company_overview.md"}]'
            ),
        }],
    )

    text = message.content[0].text.strip()
    # Extract JSON from response
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        return json.loads(match.group())
    return []


def apply_correction(
    filename: str,
    current_content: str,
    correction: str,
    question: str,
) -> str:
    """Use Claude to update a KB file based on user correction. Takes content directly (no filesystem)."""
    client = _get_anthropic_client()

    from .models import MODEL_GENERATE

    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=4096,
        system=(
            "You are updating a knowledge base document based on a user correction. "
            "The user answered NO to an alignment question and provided a correction. "
            "Update the document to incorporate the correction. "
            "Return ONLY the updated Markdown document, nothing else."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Current document ({filename}):\n\n{current_content}\n\n"
                f"Alignment question: {question}\n"
                f"User answer: NO\n"
                f"User correction: {correction}\n\n"
                "Please update the document to reflect this correction."
            ),
        }],
    )
    return message.content[0].text


def build_knowledge_base(
    urls: List[str],
    user_notes: str,
    project_name: str,
    project_description: str,
    project_id: str,
) -> Generator[dict, None, None]:
    """
    Build structured KB files from URLs and/or user notes.
    Yields SSE-compatible progress events.
    All file content is yielded in events — NO filesystem writes.
    """
    slug = _slugify(project_name)

    # Determine mode
    has_urls = bool(urls)
    has_notes = bool(user_notes.strip())
    if has_urls and has_notes:
        mode = "hybrid"
    elif has_urls:
        mode = "url"
    else:
        mode = "notes"

    yield {"type": "build_start", "mode": mode, "slug": slug, "total_steps": len(KB_FILES) + 1}

    # --- Deep-crawl URLs ---
    crawl_events: list[dict] = []  # buffer for yielding after this block
    all_pages: dict[str, str] = {}  # {url: content} across all sites
    synthesized_research = ""

    # Normalize URLs — ensure protocol prefix
    urls = [
        u if u.startswith(("http://", "https://")) else f"https://{u}"
        for u in urls
    ]

    if urls:
        for i, url in enumerate(urls):
            yield {"type": "fetch_start", "url": url, "index": i + 1, "total_urls": len(urls)}

            try:
                # Deep crawl — fetches main page + discovers and fetches subpages
                def _progress(event_type, data):
                    crawl_events.append({"type": event_type, **data})

                pages = deep_crawl_site(url, progress_callback=_progress)
                all_pages.update(pages)

                # Yield crawl progress events
                for evt in crawl_events:
                    yield evt
                crawl_events.clear()

                yield {
                    "type": "fetch_complete", "url": url, "index": i + 1,
                    "pages_crawled": len(pages),
                    "content_length": sum(len(c) for c in pages.values()),
                }
            except Exception as e:
                # Yield any partial progress
                for evt in crawl_events:
                    yield evt
                crawl_events.clear()
                yield {"type": "fetch_error", "url": url, "index": i + 1, "error": str(e)}

        # --- Synthesize research from crawled pages ---
        if all_pages:
            yield {
                "type": "research_start",
                "total_pages": len(all_pages),
                "total_chars": sum(len(c) for c in all_pages.values()),
            }

            try:
                synthesized_research = synthesize_research(
                    all_pages, project_name, project_description,
                )
                yield {
                    "type": "research_complete",
                    "content_length": len(synthesized_research),
                }
            except Exception as e:
                yield {"type": "research_error", "error": str(e)}
                # Fall back to raw page content
                synthesized_research = ""

    # --- Build master context ---
    master_parts = []
    if synthesized_research:
        master_parts.append(f"=== Deep Research Synthesis ===\n{synthesized_research}")
    elif all_pages:
        # Fallback: use raw crawled content if synthesis failed
        for page_url, content in all_pages.items():
            master_parts.append(f"=== Source: {page_url} ===\n{content[:15000]}")
    if user_notes.strip():
        master_parts.append(f"=== User Notes ===\n{user_notes}")
    if project_description:
        master_parts.append(f"=== Project Description ===\n{project_description}")

    master_context = "\n\n".join(master_parts)
    # Truncate to avoid context limits
    if len(master_context) > 150000:
        master_context = master_context[:150000] + "\n\n[Content truncated]"

    if not master_context.strip():
        yield {"type": "error", "message": "No content to build KB from. Provide URLs or notes."}
        return

    # --- Build meta content (in memory only) ---
    meta = {
        "source_mode": mode,
        "urls": urls,
        "has_user_notes": has_notes,
        "project_name": project_name,
        "slug": slug,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files": ["00_meta.json"] + [f["filename"] for f in KB_FILES],
    }
    meta_content = json.dumps(meta, indent=2)

    # --- Generate KB files ---
    generated_files: dict[str, str] = {}
    total_steps = len(KB_FILES)

    for step, spec in enumerate(KB_FILES, 1):
        yield {
            "type": "file_start",
            "filename": spec["filename"],
            "label": spec["label"],
            "step": step,
            "total_steps": total_steps,
        }

        try:
            content = _generate_file(spec, master_context, generated_files)
            generated_files[spec["filename"]] = content

            yield {
                "type": "file_complete",
                "filename": spec["filename"],
                "label": spec["label"],
                "step": step,
                "total_steps": total_steps,
                "content_length": len(content),
                "content": content,  # Include content so router can save to DB
            }
        except Exception as e:
            yield {
                "type": "file_error",
                "filename": spec["filename"],
                "step": step,
                "error": str(e),
            }

    # --- Generate alignment questions ---
    yield {"type": "eval_start"}

    questions = []
    try:
        questions = _generate_alignment_questions(master_context, generated_files)
        yield {"type": "eval_complete", "questions": questions}
    except Exception as e:
        yield {"type": "eval_complete", "questions": [], "error": str(e)}

    # --- Complete ---
    files_list = [
        {"filename": "00_meta.json", "label": "Metadata", "size": len(meta_content.encode("utf-8"))}
    ]
    for spec in KB_FILES:
        if spec["filename"] in generated_files:
            files_list.append({
                "filename": spec["filename"],
                "label": spec["label"],
                "size": len(generated_files[spec["filename"]].encode("utf-8")),
            })

    total_size = sum(f["size"] for f in files_list)

    yield {
        "type": "complete",
        "files": files_list,
        "slug": slug,
        "total_size": total_size,
        "file_count": len(files_list),
        "questions": questions,
        "meta_content": meta_content,  # Include so router can save to DB
    }
