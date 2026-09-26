"""Pain-point extraction through a local Ollama model. No hosted LLM calls."""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request

from models import Analysis

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a B2B sales analyst. You will receive a raw sales call transcript "
    "with no explicit speaker labels, plus optional verified background about the "
    "customer's company. Infer from context which parts are the customer speaking "
    "and which are the sales rep. Extract only pain points the customer actually "
    "stated or clearly implied, do not invent problems that were not discussed. "
    "Every pain point must include a verbatim supporting quote from the transcript. "
    "If verified company background is provided, use it only to sharpen the "
    "industry_guess field, do not let it influence or invent pain points that are "
    "not in the transcript. Return valid JSON only, matching the schema exactly, "
    "no markdown formatting, no commentary."
)

JSON_RETRY_LINE = (
    "Your last response was not valid JSON. Return ONLY the JSON object, nothing else."
)

SCHEMA_TEXT = """{
  "company_name": "string or null",
  "industry_guess": "string",
  "call_summary": "string",
  "pain_points": [
    {
      "id": "pp_1",
      "title": "string, 5 to 8 words",
      "description": "string, 1 to 2 sentences",
      "quote": "string, exact words from transcript",
      "speaker_role": "customer",
      "severity": "high or medium or low",
      "category": "cost or efficiency or risk or growth or compliance or other"
    }
  ],
  "buying_signals": {
    "budget_mentioned": false,
    "budget_detail": null,
    "decision_maker_present": false,
    "timeline_mentioned": null
  },
  "objections": [{"objection": "string", "handled_on_call": false}],
  "next_steps": ["string"],
  "recommended_solution_angle": "string, 1 sentence"
}"""

SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}
SEVERITIES = set(SEVERITY_RANK)
CATEGORIES = {"cost", "efficiency", "risk", "growth", "compliance", "other"}
MALFORMED_MESSAGE = (
    "Local model could not produce valid structured output, try a shorter or clearer recording"
)
UNAVAILABLE_MESSAGE = "Local model is unavailable. Confirm Ollama is running on localhost:11434."

_FENCE_START = re.compile(r"^```(?:json)?\s*", re.IGNORECASE)
_FENCE_END = re.compile(r"\s*```$")


class ExtractionError(Exception):
    """Human-readable extraction failure. The message is safe to show users."""


def _strip_fences(text: str) -> str:
    cleaned = text.strip()
    cleaned = _FENCE_START.sub("", cleaned)
    cleaned = _FENCE_END.sub("", cleaned)
    return cleaned.strip()


def parse_model_json(text: str) -> dict:
    cleaned = _strip_fences(text)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("model JSON was not an object")
    return parsed


def _as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1"}
    return bool(value)


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "n/a"}:
        return None
    return text


def _prepare(data: dict) -> dict:
    if "pain_points" not in data or "buying_signals" not in data:
        raise ValueError("missing required analysis keys")
    for key in ("industry_guess", "call_summary", "recommended_solution_angle"):
        if not _optional_str(data.get(key)):
            raise ValueError(f"missing {key}")

    points = []
    raw_points = data.get("pain_points") or []
    if not isinstance(raw_points, list):
        raise ValueError("pain_points was not a list")
    for point in raw_points:
        if not isinstance(point, dict):
            raise ValueError("pain point was not an object")
        quote = _optional_str(point.get("quote"))
        title = _optional_str(point.get("title"))
        description = _optional_str(point.get("description"))
        if not quote or not title or not description:
            raise ValueError("pain point missing quote, title, or description")
        severity = str(point.get("severity", "")).strip().lower()
        category = str(point.get("category", "")).strip().lower()
        if severity not in SEVERITIES or category not in CATEGORIES:
            raise ValueError("pain point severity or category was invalid")
        points.append(
            {
                "id": _optional_str(point.get("id")) or "pp_1",
                "title": title,
                "description": description,
                "quote": quote,
                "speaker_role": "customer",
                "severity": severity,
                "category": category,
            }
        )

    signals = data.get("buying_signals")
    if not isinstance(signals, dict):
        raise ValueError("buying_signals was not an object")
    if "budget_mentioned" not in signals or "decision_maker_present" not in signals:
        raise ValueError("buying_signals missing required flags")

    objections = []
    for item in data.get("objections") or []:
        if not isinstance(item, dict) or not _optional_str(item.get("objection")):
            raise ValueError("objection was incomplete")
        objections.append(
            {
                "objection": _optional_str(item.get("objection")),
                "handled_on_call": _as_bool(item.get("handled_on_call")),
            }
        )

    steps = data.get("next_steps") or []
    if not isinstance(steps, list):
        raise ValueError("next_steps was not a list")

    return {
        "company_name": _optional_str(data.get("company_name")),
        "industry_guess": _optional_str(data.get("industry_guess")),
        "call_summary": _optional_str(data.get("call_summary")),
        "pain_points": points,
        "buying_signals": {
            "budget_mentioned": _as_bool(signals.get("budget_mentioned")),
            "budget_detail": _optional_str(signals.get("budget_detail")),
            "decision_maker_present": _as_bool(signals.get("decision_maker_present")),
            "timeline_mentioned": _optional_str(signals.get("timeline_mentioned")),
        },
        "objections": objections,
        "next_steps": [str(step).strip() for step in steps if str(step).strip()],
        "recommended_solution_angle": _optional_str(data.get("recommended_solution_angle")),
    }


def _cap_pain_points(payload: dict) -> dict:
    ranked = sorted(
        payload["pain_points"],
        key=lambda point: SEVERITY_RANK[point["severity"]],
    )[:4]
    for index, point in enumerate(ranked, start=1):
        point["id"] = f"pp_{index}"
    payload["pain_points"] = ranked
    return payload


def _user_prompt(transcript: str, verified_description: str | None, retry: bool) -> str:
    parts = [
        "JSON schema:",
        SCHEMA_TEXT,
        "",
        "Transcript:",
        transcript.strip(),
    ]
    if verified_description:
        parts.extend(["", f"Verified company background: {verified_description}"])
    if retry:
        parts.extend(["", JSON_RETRY_LINE])
    return "\n".join(parts)


def _call_ollama(user_prompt: str) -> str:
    model = os.getenv("OLLAMA_MODEL", "llama3.1:8b").strip() or "llama3.1:8b"
    payload = {
        "model": model,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "options": {"temperature": 0, "num_ctx": 4096},
    }
    request = urllib.request.Request(
        "http://localhost:11434/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        logger.warning("Ollama request failed: %s", exc)
        raise ExtractionError(UNAVAILABLE_MESSAGE) from exc
    message = body.get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Ollama returned an empty message")
    return content


def extract_pain_points(transcript: str, verified_description: str | None = None) -> dict:
    """Return analysis JSON, retrying malformed output up to three attempts."""
    if not transcript or not transcript.strip():
        raise ExtractionError(
            "Could not transcribe audio, check file is not silent or corrupted"
        )

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            raw = _call_ollama(
                _user_prompt(transcript, verified_description, retry=attempt > 0)
            )
            parsed = _prepare(parse_model_json(raw))
            analysis = Analysis.model_validate(parsed)
            return _cap_pain_points(analysis.model_dump())
        except ExtractionError:
            raise
        except Exception as exc:
            last_error = exc
            logger.warning("Extraction attempt %s failed: %s", attempt + 1, exc)

    logger.warning("Extraction failed after 3 attempts: %s", last_error)
    raise ExtractionError(MALFORMED_MESSAGE)
