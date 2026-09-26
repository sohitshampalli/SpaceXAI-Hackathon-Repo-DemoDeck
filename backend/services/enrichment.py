"""Company enrichment via Firecrawl and Exa.

Either provider can fail. Callers always receive null fields instead of an
exception. Exa usage follows the build-with-exa skill: one POST /search,
type auto, contents.highlights true, plus start_published_date because the
product requires a hard last-six-months window.
"""

from __future__ import annotations

import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

_EMPTY: dict[str, Any] = {
    "verified_description": None,
    "logo_url": None,
    "recent_news_snippet": None,
    "source": "none",
}

_URL_RE = re.compile(r"https?://[^\s<>\"')\]]+", re.IGNORECASE)
_DOMAIN_RE = re.compile(r"\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\b", re.IGNORECASE)
_COMPANY_PATTERNS = (
    re.compile(
        r"(?:company(?:'s)? name is|our company is|the company is|we(?:'re| are) called)\s+([A-Za-z0-9&.'\-]+(?:\s+[A-Za-z0-9&.'\-]+){0,4})",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:I work at|I'm with|I am with|we're from|we are from|calling from)\s+([A-Za-z0-9&.'\-]+(?:\s+[A-Za-z0-9&.'\-]+){0,4})",
        re.IGNORECASE,
    ),
)
_SKIP_DOMAINS = {
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "example.com",
}
_SKIP_NAMES = {"the", "a", "an", "our", "my", "this", "that", "it", "we", "i"}


class _LogoHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.og_image: str | None = None
        self.icons: list[str] = []
        self.logo_imgs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {key.lower(): (value or "") for key, value in attrs}
        if tag == "meta":
            prop = (attr.get("property") or attr.get("name") or "").lower()
            if prop in {"og:image", "og:image:url"} and attr.get("content"):
                self.og_image = attr["content"].strip()
        elif tag == "link":
            rel = attr.get("rel", "").lower()
            href = attr.get("href", "").strip()
            if href and any(token in rel for token in ("icon", "apple-touch-icon")):
                self.icons.append(href)
        elif tag == "img":
            src = attr.get("src", "").strip()
            blob = " ".join(
                [
                    src,
                    attr.get("alt", ""),
                    attr.get("class", ""),
                    attr.get("id", ""),
                ]
            ).lower()
            if src and "logo" in blob:
                self.logo_imgs.append(src)


def empty_enrichment() -> dict[str, Any]:
    return dict(_EMPTY)


def extract_domain(text: str) -> str | None:
    """Return a domain only when the transcript states a URL or host."""
    if not text:
        return None
    for match in _URL_RE.findall(text):
        host = urlparse(match).netloc.lower().split("@")[-1]
        host = host.split(":")[0]
        if host.startswith("www."):
            host = host[4:]
        if host and host not in _SKIP_DOMAINS and "." in host:
            return host
    for match in _DOMAIN_RE.findall(text):
        host = match.lower()
        if host.startswith("www."):
            host = host[4:]
        if host in _SKIP_DOMAINS:
            continue
        if host.endswith((".png", ".jpg", ".jpeg", ".gif", ".css", ".js")):
            continue
        return host
    return None


def extract_company_name(text: str) -> str | None:
    """Return a company name only from an explicit spoken attribution."""
    if not text:
        return None
    for pattern in _COMPANY_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        name = " ".join(match.group(1).split()).strip(" .,")
        if name.lower() in _SKIP_NAMES or len(name) < 2:
            continue
        return name
    return None


def _homepage(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    if not re.match(r"^https?://", raw, re.IGNORECASE):
        raw = "https://" + raw
    parsed = urlparse(raw)
    host = parsed.netloc.lower().split("@")[-1]
    if not host or "." not in host:
        return None
    scheme = parsed.scheme or "https"
    return f"{scheme}://{host}"


def _looks_like_domain(value: str) -> bool:
    return bool(_homepage(value)) and " " not in value.strip()


def _first_sentences(text: str, limit: int = 3) -> str | None:
    cleaned = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text or "")
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"^#{1,6}\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{2,}", "\n", cleaned).strip()
    if not cleaned:
        return None
    chunks = re.split(r"(?<=[.!?])\s+", cleaned.replace("\n", " "))
    picked: list[str] = []
    for chunk in chunks:
        sentence = " ".join(chunk.split())
        if len(sentence) < 40:
            continue
        picked.append(sentence)
        if len(picked) >= limit:
            break
    if not picked:
        return None
    return " ".join(picked)[:800]


def _absolute(base: str, candidate: str | None) -> str | None:
    if not candidate:
        return None
    candidate = candidate.strip()
    if not candidate or candidate.startswith("data:"):
        return None
    return urljoin(base, candidate)


def _description_from_document(doc: Any) -> str | None:
    metadata = getattr(doc, "metadata", None)
    meta_description = None
    title = None
    if metadata is not None:
        meta_description = getattr(metadata, "description", None) or getattr(metadata, "og_description", None)
        title = getattr(metadata, "title", None) or getattr(metadata, "og_title", None)
    body = _first_sentences(getattr(doc, "markdown", None) or "")
    if body:
        return body
    if meta_description and str(meta_description).strip():
        text = " ".join(str(meta_description).split())
        if title and str(title).strip():
            return f"{str(title).strip()}. {text}"[:800]
        return text[:800]
    if title and str(title).strip():
        return str(title).strip()[:800]
    return None


def _logo_from_document(doc: Any, page_url: str) -> str | None:
    html = getattr(doc, "html", None) or getattr(doc, "raw_html", None) or ""
    parser = _LogoHTMLParser()
    if html:
        try:
            parser.feed(html)
        except Exception:
            logger.warning("Could not parse Firecrawl HTML for a logo", exc_info=True)
    for candidate in parser.logo_imgs:
        absolute = _absolute(page_url, candidate)
        if absolute:
            return absolute
    metadata = getattr(doc, "metadata", None)
    og_image = getattr(metadata, "og_image", None) if metadata is not None else None
    for candidate in (parser.og_image, og_image, *parser.icons):
        absolute = _absolute(page_url, candidate if isinstance(candidate, str) else None)
        if absolute:
            return absolute
    return None


def _firecrawl_homepage(page_url: str) -> dict[str, str | None]:
    found: dict[str, str | None] = {"description": None, "logo_url": None}
    api_key = os.getenv("FIRECRAWL_API_KEY", "").strip()
    if not api_key:
        logger.warning("FIRECRAWL_API_KEY is not set; skipping homepage scrape")
        return found
    try:
        from firecrawl import Firecrawl

        client = Firecrawl(api_key=api_key)
        document = client.scrape(
            page_url,
            formats=["markdown", "html"],
            only_main_content=True,
            timeout=20000,
        )
        found["description"] = _description_from_document(document)
        found["logo_url"] = _logo_from_document(document, page_url)
    except Exception:
        logger.warning("Firecrawl scrape failed for %s", page_url, exc_info=True)
    return found


def _one_line_snippet(title: str | None, highlights: list[str] | None) -> str | None:
    line = ""
    if highlights:
        first = " ".join(str(highlights[0]).split())
        parts = re.split(r"(?<=[.!?])\s+", first)
        line = parts[0] if parts else first
    title_text = " ".join((title or "").split())
    if title_text and line:
        snippet = f"{title_text} — {line}"
    else:
        snippet = title_text or line
    snippet = " ".join(snippet.split())
    return snippet or None


def _exa_news(company: str) -> str | None:
    api_key = os.getenv("EXA_API_KEY", "").strip()
    if not api_key:
        logger.warning("EXA_API_KEY is not set; skipping news search")
        return None
    start = (datetime.now(timezone.utc) - timedelta(days=183)).strftime("%Y-%m-%dT%H:%M:%SZ")
    query = f"{company} recent news OR funding OR announcement"
    try:
        from exa_py import Exa

        exa = Exa(api_key=api_key)
        response = exa.search(
            query,
            type="auto",
            contents={"highlights": True},
            start_published_date=start,
        )
        results = list(getattr(response, "results", None) or [])
        if not results:
            logger.warning("Exa returned no results for %s", company)
            return None
        top = results[0]
        return _one_line_snippet(getattr(top, "title", None), getattr(top, "highlights", None))
    except Exception:
        logger.warning("Exa search failed for %s", company, exc_info=True)
        return None


def _combine(description: str | None, logo_url: str | None, news: str | None) -> dict[str, Any]:
    if description or logo_url:
        source = "firecrawl"
    elif news:
        source = "exa"
    else:
        source = "none"
    return {
        "verified_description": description,
        "logo_url": logo_url,
        "recent_news_snippet": news,
        "source": source,
    }


def enrich_company(name_or_domain: str, *, domain: str | None = None) -> dict[str, Any]:
    """Enrich one company. Never raises.

    `name_or_domain` is the Exa query subject. When it looks like a domain,
    Firecrawl scrapes that homepage. Pass `domain` when the caller knows a
    homepage that is different from the search name.
    """
    subject = " ".join((name_or_domain or "").split()).strip()
    if not subject and not domain:
        logger.info("Enrichment skipped: no company name or domain")
        return empty_enrichment()

    scrape_target = _homepage(domain) if domain else None
    if scrape_target is None and _looks_like_domain(subject):
        scrape_target = _homepage(subject)
    search_subject = subject or (urlparse(scrape_target).netloc if scrape_target else "")
    if not search_subject and not scrape_target:
        return empty_enrichment()

    description = None
    logo_url = None
    news = None
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            firecrawl_future = (
                pool.submit(_firecrawl_homepage, scrape_target) if scrape_target else None
            )
            exa_future = pool.submit(_exa_news, search_subject) if search_subject else None
            if firecrawl_future is not None:
                scraped = firecrawl_future.result()
                description = scraped.get("description")
                logo_url = scraped.get("logo_url")
            if exa_future is not None:
                news = exa_future.result()
    except Exception:
        logger.warning("Company enrichment failed open", exc_info=True)
        return empty_enrichment()
    return _combine(description, logo_url, news)


def enrich_from_inputs(
    company_name: str | None,
    company_domain: str | None,
    transcript: str,
) -> dict[str, Any]:
    """Run enrichment when a domain or a confident company name is available."""
    try:
        domain = _homepage(company_domain)
        domain_host = urlparse(domain).netloc if domain else None
        if domain_host and domain_host.startswith("www."):
            domain_host = domain_host[4:]
        if not domain_host:
            domain_host = extract_domain(transcript)
            domain = _homepage(domain_host) if domain_host else None
            if domain:
                domain_host = urlparse(domain).netloc
                if domain_host.startswith("www."):
                    domain_host = domain_host[4:]

        name = " ".join((company_name or "").split()).strip() or extract_company_name(transcript)
        if not name and not domain_host:
            logger.info("No company domain or confident name; enrichment left empty")
            return empty_enrichment()
        return enrich_company(name or domain_host or "", domain=domain_host)
    except Exception:
        logger.warning("Enrichment inputs could not be resolved", exc_info=True)
        return empty_enrichment()
