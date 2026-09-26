"""Background pipeline. Each stage records a human-readable failure and stops."""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

from jobs import fail_job, get_job, job_dir, update_job
from services.deck_builder import build_deck
from services.enrichment import enrich_from_inputs
from services.extraction import ExtractionError, extract_pain_points
from services.logos import download_logo
from services.preview import render_preview
from services.transcription import transcribe

logger = logging.getLogger(__name__)

TRANSCRIBE_ERROR = "Could not transcribe audio, check file is not silent or corrupted"


def start_job(job_id: str) -> None:
    """Run the pipeline off the event loop so status polling stays responsive."""
    threading.Thread(target=process_job, args=(job_id,), name=f"job-{job_id}", daemon=True).start()


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _delete_audio(path_value: str | None) -> None:
    if not path_value:
        return
    path = Path(path_value)
    try:
        path.unlink(missing_ok=True)
    except Exception:
        logger.warning("Could not delete raw audio at %s", path, exc_info=True)


def _choose_logo(directory: Path, enrichment: dict) -> Path | None:
    manual = directory / "logo_manual.png"
    if manual.exists():
        return manual
    logo_url = enrichment.get("logo_url")
    if not logo_url:
        return None
    return download_logo(str(logo_url), directory / "logo_enriched.png")


def process_job(job_id: str) -> None:
    job = get_job(job_id)
    if job is None:
        return
    directory = job_dir(job_id)
    audio_path = job.get("audio_path")
    try:
        update_job(job_id, status="transcribing", progress=20, error=None)
        try:
            transcript = transcribe(str(audio_path))
        except Exception:
            logger.exception("Transcription failed for job %s", job_id)
            fail_job(job_id, TRANSCRIBE_ERROR)
            return
        finally:
            _delete_audio(audio_path)

        if not transcript or not transcript.strip():
            fail_job(job_id, TRANSCRIBE_ERROR)
            return
        (directory / "transcript.txt").write_text(transcript, encoding="utf-8")

        update_job(job_id, status="enriching", progress=35)
        enrichment = enrich_from_inputs(
            job.get("company_name"),
            job.get("company_domain"),
            transcript,
        )
        _write_json(directory / "enrichment.json", enrichment)
        logo_path = _choose_logo(directory, enrichment)

        update_job(job_id, status="extracting", progress=55)
        try:
            analysis = extract_pain_points(transcript, enrichment.get("verified_description"))
        except ExtractionError as exc:
            fail_job(job_id, str(exc))
            return
        except Exception:
            logger.exception("Extraction failed for job %s", job_id)
            fail_job(
                job_id,
                "Local model could not produce valid structured output, try a shorter or clearer recording",
            )
            return
        _write_json(directory / "analysis.json", analysis)

        update_job(job_id, status="building", progress=75)
        try:
            build_deck(
                analysis,
                enrichment,
                directory / "deck.pptx",
                salesperson_name=job.get("salesperson_name") or "",
                company_name=job.get("company_name"),
                brand_color_primary=job.get("brand_color_primary") or "#14324A",
                brand_color_secondary=job.get("brand_color_secondary") or "#C46B3A",
                logo_path=logo_path,
            )
        except Exception:
            logger.exception("Deck build failed for job %s", job_id)
            fail_job(job_id, "Could not build the slide deck from this recording")
            return

        update_job(job_id, status="previewing", progress=90)
        try:
            preview = render_preview(directory / "deck.pptx", directory / "preview")
        except Exception:
            logger.exception("Preview rendering failed for job %s", job_id)
            fail_job(job_id, "Could not render slide previews")
            return
        update_job(job_id, preview_placeholder=bool(preview.get("placeholder")))
        _write_json(directory / "preview.json", preview)

        update_job(job_id, status="done", progress=100, error=None)
        logger.info("Job %s completed", job_id)
    except Exception:
        logger.exception("Job %s failed unexpectedly", job_id)
        current = get_job(job_id)
        if current and current.get("status") != "failed":
            fail_job(job_id, "The job failed unexpectedly. Please try the recording again.")
