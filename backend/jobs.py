"""In-memory job records plus on-disk artifacts under /tmp/jobs."""

from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path

JOBS_ROOT = Path("/tmp/jobs")
_LOCK = threading.Lock()
_JOBS: dict[str, dict] = {}

PUBLIC_FIELDS = ("id", "status", "progress", "error", "preview_placeholder")


def job_dir(job_id: str) -> Path:
    return JOBS_ROOT / job_id


def create_job(**metadata) -> dict:
    job_id = uuid.uuid4().hex
    record = {
        "id": job_id,
        "status": "queued",
        "progress": 0,
        "error": None,
        "preview_placeholder": False,
        **metadata,
    }
    path = job_dir(job_id)
    path.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        _JOBS[job_id] = record
    _persist(job_id)
    return dict(record)


def get_job(job_id: str) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None


def public_job(job_id: str) -> dict | None:
    job = get_job(job_id)
    if job is None:
        return None
    payload = {field: job.get(field) for field in PUBLIC_FIELDS}
    if payload.get("error") is None:
        payload["error"] = None
    payload["preview_placeholder"] = bool(job.get("preview_placeholder"))
    return payload


def update_job(job_id: str, **fields) -> None:
    with _LOCK:
        if job_id not in _JOBS:
            return
        _JOBS[job_id].update(fields)
    _persist(job_id)


def fail_job(job_id: str, message: str) -> None:
    update_job(job_id, status="failed", error=message)


def _persist(job_id: str) -> None:
    job = get_job(job_id)
    if job is None:
        return
    snapshot = {field: job.get(field) for field in PUBLIC_FIELDS}
    path = job_dir(job_id) / "job.json"
    path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
