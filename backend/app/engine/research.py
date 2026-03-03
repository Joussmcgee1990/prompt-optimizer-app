"""URL research engine — deep multi-page crawling and Gemini-powered intelligence synthesis.

Crawls company websites and synthesises organisational intelligence: structure,
leadership, governance, culture, and risk signals.

Uses Gemini 2.5 Pro (Deep Research) for research synthesis.
Uses Sonnet 4.6 for legacy single-page research.
"""

import os
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx

_DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent.parent)))
PROJECTS_DIR = _DATA_DIR / "projects"

_anthropic_client = None
_gemini_client = None

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


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


def _clean_html(html: str) -> str:
    """Strip HTML tags and extra whitespace to get plain text."""
    # Remove script and style blocks
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # Remove nav, footer, header boilerplate
    html = re.sub(r"<nav[^>]*>.*?</nav>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<footer[^>]*>.*?</footer>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # Remove HTML comments
    html = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL)
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Decode common entities
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&nbsp;", " ").replace("&quot;", '"').replace("&#39;", "'")
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_internal_links(html: str, base_url: str) -> list[str]:
    """Extract internal links from raw HTML."""
    base_parsed = urlparse(base_url)
    base_domain = base_parsed.netloc

    # Find all href values
    links = re.findall(r'href=["\']([^"\'#]+)["\']', html, re.IGNORECASE)

    internal_links = set()
    for link in links:
        # Resolve relative URLs
        full_url = urljoin(base_url, link)
        parsed = urlparse(full_url)

        # Skip non-HTTP
        if parsed.scheme not in ("http", "https"):
            continue

        # Same domain only
        if parsed.netloc != base_domain:
            continue

        # Skip file downloads and media
        path = parsed.path.lower()
        skip_extensions = (
            ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp",
            ".css", ".js", ".zip", ".mp4", ".mp3", ".ico", ".woff", ".woff2",
            ".ttf", ".eot", ".xml", ".json",
        )
        if any(path.endswith(ext) for ext in skip_extensions):
            continue

        # Skip common junk paths
        skip_paths = ("/cdn-cgi/", "/wp-json/", "/wp-admin/", "/feed/", "/xmlrpc")
        if any(sp in path for sp in skip_paths):
            continue

        # Normalize — remove query params and fragments, strip trailing slash
        clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        if clean_url.endswith("/") and len(parsed.path) > 1:
            clean_url = clean_url.rstrip("/")

        internal_links.add(clean_url)

    return list(internal_links)


# Priority keywords — earlier = higher priority for subpage discovery
_PRIORITY_KEYWORDS = [
    "about", "who-we-are", "our-story", "company", "mission",
    "services", "solutions", "what-we-do", "offerings", "capabilities",
    "products", "features", "platform", "technology", "how-it-works",
    "pricing", "plans", "packages",
    "team", "leadership", "people", "staff",
    "customers", "clients", "case-studies", "case-study", "testimonials", "reviews", "success-stories",
    "industries", "sectors", "verticals", "markets",
    "partners", "integrations", "ecosystem",
    "careers", "jobs", "join", "hiring",
    "contact", "get-in-touch", "demo", "book",
    "blog", "news", "press", "media", "resources",
    "faq", "help", "support",
    "why", "benefits", "advantages", "results",
]


def _prioritize_links(links: list[str], base_url: str, max_pages: int = 15) -> list[str]:
    """Sort links by business relevance and limit count."""
    base_path = urlparse(base_url).path

    scored = []
    for link in links:
        path = urlparse(link).path.lower()

        # Skip the base URL itself
        if path == base_path or path == base_path.rstrip("/"):
            continue

        score = 0
        for i, keyword in enumerate(_PRIORITY_KEYWORDS):
            if keyword in path:
                score = len(_PRIORITY_KEYWORDS) - i
                break

        # Penalize deep paths (likely blog posts, not main pages)
        depth = path.strip("/").count("/")
        if depth > 2:
            score -= 10
        elif depth > 1:
            score -= 3

        # Bonus for short paths (likely main sections)
        if depth <= 1 and len(path) < 30:
            score += 5

        scored.append((score, link))

    scored.sort(key=lambda x: -x[0])
    return [link for _, link in scored[:max_pages]]


def fetch_url_content(url: str) -> str:
    """Fetch a single URL and return cleaned text content. (Legacy — used as fallback.)"""
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": _USER_AGENT})
            resp.raise_for_status()
            return _clean_html(resp.text)
    except Exception as e:
        raise RuntimeError(f"Failed to fetch URL: {e}")


def deep_crawl_site(url: str, progress_callback=None) -> dict[str, str]:
    """
    Deep crawl a site — fetch the main page + discover and fetch key subpages.

    Returns dict of {url: cleaned_text_content}.
    progress_callback(event_type, data) is called for progress events.
    """
    pages: dict[str, str] = {}

    # 1. Fetch main page (keep raw HTML for link extraction)
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": _USER_AGENT})
            resp.raise_for_status()
            raw_html = resp.text
            cleaned = _clean_html(raw_html)
            pages[url] = cleaned
            if progress_callback:
                progress_callback("crawl_page", {
                    "url": url, "status": "fetched",
                    "content_length": len(cleaned), "is_main": True,
                })
    except Exception as e:
        if progress_callback:
            progress_callback("crawl_page", {"url": url, "status": "error", "error": str(e)})
        return pages

    # 2. Discover subpages from the main page HTML
    all_links = _extract_internal_links(raw_html, url)
    priority_links = _prioritize_links(all_links, url)

    if progress_callback:
        progress_callback("crawl_discovery", {
            "total_links": len(all_links),
            "priority_links": len(priority_links),
        })

    # 3. Fetch subpages
    with httpx.Client(timeout=20, follow_redirects=True) as client:
        for subpage_url in priority_links:
            # Skip if already fetched (normalized URL might match)
            if subpage_url in pages:
                continue

            try:
                resp = client.get(subpage_url, headers={"User-Agent": _USER_AGENT})
                resp.raise_for_status()
                content = _clean_html(resp.text)

                # Skip very thin pages (likely redirects, error pages, etc.)
                if len(content) < 150:
                    continue

                pages[subpage_url] = content
                if progress_callback:
                    progress_callback("crawl_page", {
                        "url": subpage_url, "status": "fetched",
                        "content_length": len(content), "is_main": False,
                    })
            except Exception:
                if progress_callback:
                    progress_callback("crawl_page", {
                        "url": subpage_url, "status": "error",
                    })

    return pages


def synthesize_research(
    pages: dict[str, str],
    project_name: str,
    project_description: str,
) -> str:
    """
    Use Gemini 2.5 Pro to synthesize a comprehensive intelligence dossier from all crawled pages.
    This produces the rich input that feeds into KB file generation.
    """
    client = _get_gemini_client()

    # Combine all pages with their URLs
    combined_parts = []
    for page_url, content in pages.items():
        # Limit per page to avoid overwhelming the context
        truncated = content[:20000]
        if len(content) > 20000:
            truncated += "\n[...page content truncated]"
        combined_parts.append(f"=== PAGE: {page_url} ===\n{truncated}")

    combined = "\n\n".join(combined_parts)

    # Hard limit on total input
    if len(combined) > 120000:
        combined = combined[:120000] + "\n\n[Additional content truncated]"

    system_instruction = (
        "You are a strategic intelligence analyst conducting deep organisational research. "
        "You have been given content crawled from multiple pages of a company's website. "
        "Your job is to synthesize this into a COMPREHENSIVE intelligence dossier that captures "
        "everything knowable about this organisation's structure, leadership, power dynamics, "
        "culture, and risk profile.\n\n"
        "This is NOT sales research. You are building an intelligence picture that reveals "
        "how this organisation works, who holds power, how decisions get made, where tensions "
        "sit, and what pressures are shaping behaviour.\n\n"
        "Extract and organize under clear Markdown headings:\n\n"
        "## Company Identity & Structure\n"
        "- Official name, founding date, headquarters, legal structure\n"
        "- Ownership model (founder-led, PE-backed, publicly listed, family-owned, etc.)\n"
        "- Funding history — rounds, investors, valuations if available\n"
        "- Revenue model and primary business lines\n"
        "- Company stage (startup, scale-up, mature, turnaround)\n"
        "- Recent strategic events (acquisitions, pivots, restructures, market entries)\n\n"
        "## Leadership & Key People\n"
        "- EVERY named person with their title, role, and any biographical detail\n"
        "- Career backgrounds — previous companies, roles, industries, education\n"
        "- Tenure at this company — how long in role, how long at company\n"
        "- Public statements, quotes, interviews, blog posts attributed to individuals\n"
        "- Communication style signals (formal/informal, data-driven/narrative, cautious/bold)\n"
        "- Board members, advisors, investors with known influence\n"
        "- Any hints at reporting lines, who reports to whom\n\n"
        "## Governance & Decision-Making\n"
        "- Board composition and any disclosed governance structures\n"
        "- Investor involvement — active boards, PE operating partners, VC partners\n"
        "- Any signals about decision-making speed, process, centralisation\n"
        "- Regulatory or compliance frameworks mentioned\n"
        "- Committee structures, advisory boards\n\n"
        "## Culture & Organisational Signals\n"
        "- Stated values, mission, and cultural priorities\n"
        "- Hiring patterns — what roles are open, growth areas, team sizes mentioned\n"
        "- Language tone across the site (corporate/startup, formal/casual, technical/accessible)\n"
        "- DEI statements, sustainability, social responsibility positioning\n"
        "- Office locations, remote/hybrid signals\n"
        "- Awards, certifications, 'best places to work' type signals\n"
        "- Any Glassdoor-style indicators or employee sentiment signals\n\n"
        "## Products, Market & Competitive Position\n"
        "- Products/services with descriptions (keep factual, not promotional)\n"
        "- Target markets, industries, customer segments\n"
        "- Named customers, partnerships, integrations\n"
        "- Competitive positioning — who they compare themselves against\n"
        "- Market claims, growth metrics, revenue indicators\n\n"
        "## Risk & Pressure Signals\n"
        "- Any indicators of financial pressure (pricing changes, layoffs, pivots)\n"
        "- Customer concentration risk (if a few logos dominate case studies)\n"
        "- Regulatory exposure mentioned or implied\n"
        "- Technology debt or platform migration signals\n"
        "- Leadership turnover indicators\n"
        "- Market headwinds acknowledged or implied\n\n"
        "## Inferred Intelligence\n"
        "- Power dynamics — who likely drives key decisions (founder, board, PE sponsor)\n"
        "- Growth stage assessment with reasoning\n"
        "- Organisational health signals (growing/stable/stressed)\n"
        "- Likely internal priorities based on hiring, messaging, and investment patterns\n"
        "- Change readiness — how open is this org to transformation\n\n"
        "CRITICAL RULES:\n"
        "1. Include EVERY useful detail — more is better. Do not summarize away specifics.\n"
        "2. When you infer something (vs. stating a fact), mark it clearly with [INFERRED]\n"
        "3. If information is absent, explicitly note it as 'NOT FOUND on website'\n"
        "4. Quote specific claims, statements, and data points\n"
        "5. Note the source page URL for key facts when relevant\n"
        "6. Pay special attention to PEOPLE — names, backgrounds, tenure, quotes\n"
        "7. Distinguish between what the company SAYS about itself and observable reality"
    )

    user_content = (
        f"Company/Project Name: {project_name}\n"
        f"Project Description: {project_description or 'Not provided'}\n\n"
        f"Total pages crawled: {len(pages)}\n\n"
        f"--- CRAWLED CONTENT ---\n{combined}\n"
        f"--- END CRAWLED CONTENT ---\n\n"
        "Create a comprehensive intelligence dossier capturing ALL available information "
        "about this organisation. Focus on structure, leadership, governance, culture, "
        "and risk signals. Every detail about people, power, and organisational dynamics matters."
    )

    from google import genai as _genai
    from .models import MODEL_KB_RESEARCH, MODEL_GENERATE

    # Try Gemini first, fall back to Claude if quota exhausted
    try:
        response = client.models.generate_content(
            model=MODEL_KB_RESEARCH,
            contents=user_content,
            config=_genai.types.GenerateContentConfig(
                system_instruction=system_instruction,
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
                system=system_instruction,
                messages=[{"role": "user", "content": user_content}],
            )
            return message.content[0].text
        raise


def research_url(url: str, project_description: str = "") -> str:
    """
    Fetch a URL and use Claude to create a structured knowledge document.
    Legacy function — still works for single-page research.
    """
    client = _get_anthropic_client()
    raw_content = fetch_url_content(url)

    if len(raw_content) > 80000:
        raw_content = raw_content[:80000] + "\n\n[Content truncated]"

    domain = urlparse(url).netloc

    from .models import MODEL_GENERATE

    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=4096,
        system=(
            "You are a research assistant. Extract and organize useful information "
            "from web content into a clean, structured knowledge base document. "
            "Focus on factual information and key details. Use clear headings and bullet points. "
            "Ignore navigation, ads, footers, and boilerplate."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Here is the raw text content from {url}:\n\n"
                f"---\n{raw_content}\n---\n\n"
                f"{'Project context: ' + project_description + chr(10) + chr(10) if project_description else ''}"
                f"Create a clean, well-organized knowledge base document from this content."
            ),
        }],
    )

    return message.content[0].text


def save_research_as_document(project_id: str, url: str, content: str) -> str:
    """Save researched content as a .md file in the project's data directory."""
    data_dir = PROJECTS_DIR / project_id / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    domain = urlparse(url).netloc.replace("www.", "")
    safe_name = re.sub(r"[^a-zA-Z0-9.-]", "_", domain)
    filename = f"research-{safe_name}.md"
    file_path = data_dir / filename
    file_path.write_text(content, encoding="utf-8")

    return filename
