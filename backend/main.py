"""Demo to Deck API."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

from jobs import create_job, job_dir, public_job
from pipeline import start_job

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

ALLOWED_AUDIO = {
    ".wav",
    ".mp3",
    ".m4a",
    ".aac",
    ".ogg",
    ".flac",
    ".webm",
    ".mp4",
    ".mpeg",
    ".mpga",
}
CONTENT_TYPES = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "video/mp4": ".mp4",
}

app = FastAPI(title="Demo to Deck", version="0.1.0")

_origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000").strip()
if _origins_raw == "*":
    _origins = ["*"]
else:
    _origins = [item.strip() for item in _origins_raw.split(",") if item.strip()] or [
        "http://localhost:3000"
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _max_bytes() -> int:
    megabytes = float(os.getenv("MAX_UPLOAD_MB", "100"))
    return int(megabytes * 1024 * 1024)


def _max_minutes() -> float:
    return float(os.getenv("MAX_AUDIO_MINUTES", "20"))


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _hex_color(value: str, field: str) -> str:
    color = value.strip()
    if not re.fullmatch(r"#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?", color):
        raise HTTPException(
            status_code=400,
            detail=f"{field} must be a hex color like #14324A",
        )
    if not color.startswith("#"):
        color = f"#{color}"
    if len(color) == 4:
        color = "#" + "".join(ch * 2 for ch in color[1:])
    return color.upper()


def _audio_extension(upload: UploadFile) -> str:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix in ALLOWED_AUDIO:
        return suffix
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    mapped = CONTENT_TYPES.get(content_type)
    if mapped:
        return mapped
    raise HTTPException(
        status_code=400,
        detail="Unsupported audio type. Upload a wav, mp3, m4a, aac, ogg, flac, webm, or mp4 file.",
    )


def _probe_duration(path: Path) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        logger.warning("ffprobe failed: %s", exc)
        raise HTTPException(
            status_code=400,
            detail="Could not read audio duration, check the file is not corrupted",
        ) from exc
    if result.returncode != 0:
        raise HTTPException(
            status_code=400,
            detail="Could not read audio duration, check the file is not corrupted",
        )
    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not read audio duration, check the file is not corrupted",
        ) from exc
    streams = payload.get("streams") or []
    if not any(stream.get("codec_type") == "audio" for stream in streams):
        raise HTTPException(
            status_code=400,
            detail="Could not read audio duration, check the file is not corrupted",
        )
    try:
        return float((payload.get("format") or {}).get("duration") or 0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not read audio duration, check the file is not corrupted",
        ) from exc


def _require_job(job_id: str) -> dict:
    job = public_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _read_json(path: Path, pending_detail: str) -> JSONResponse:
    if not path.exists():
        raise HTTPException(status_code=409, detail=pending_detail)
    return JSONResponse(json.loads(path.read_text(encoding="utf-8")))


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/jobs", status_code=202)
async def create_audio_job(
    background: BackgroundTasks,
    audio_file: UploadFile = File(...),
    salesperson_name: str = Form(...),
    brand_color_primary: str = Form(...),
    brand_color_secondary: str = Form(...),
    company_name: str | None = Form(None),
    company_domain: str | None = Form(None),
    logo_file: UploadFile | None = File(None),
):
    salesperson = _clean(salesperson_name)
    if not salesperson:
        raise HTTPException(status_code=400, detail="salesperson_name is required")
    primary = _hex_color(brand_color_primary, "brand_color_primary")
    secondary = _hex_color(brand_color_secondary, "brand_color_secondary")
    extension = _audio_extension(audio_file)

    payload = await audio_file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Audio file is empty")
    if len(payload) > _max_bytes():
        raise HTTPException(
            status_code=400,
            detail=f"Audio file exceeds the {os.getenv('MAX_UPLOAD_MB', '100')} MB upload limit",
        )

    staging = Path(tempfile.mkdtemp(prefix="dtd-upload-", dir="/tmp"))
    try:
        audio_tmp = staging / f"audio{extension}"
        audio_tmp.write_bytes(payload)
        duration = _probe_duration(audio_tmp)
        limit = _max_minutes() * 60
        if duration <= 0:
            raise HTTPException(
                status_code=400,
                detail="Could not read audio duration, check the file is not corrupted",
            )
        if duration > limit + 0.5:
            raise HTTPException(
                status_code=400,
                detail=f"Audio exceeds the {_max_minutes():g} minute limit",
            )

        logo_tmp = None
        if logo_file is not None and logo_file.filename:
            logo_bytes = await logo_file.read()
            if logo_bytes:
                logo_tmp = staging / "logo_manual.png"
                try:
                    image = Image.open(BytesIO(logo_bytes))
                    image.convert("RGBA").save(logo_tmp, format="PNG")
                except Exception as exc:
                    raise HTTPException(
                        status_code=400,
                        detail="Logo file must be a PNG, JPG, GIF, or WEBP image",
                    ) from exc

        job = create_job(
            salesperson_name=salesperson,
            company_name=_clean(company_name),
            company_domain=_clean(company_domain),
            brand_color_primary=primary,
            brand_color_secondary=secondary,
        )
        directory = job_dir(job["id"])
        audio_path = directory / f"audio{extension}"
        shutil.move(str(audio_tmp), audio_path)
        if logo_tmp is not None:
            shutil.move(str(logo_tmp), directory / "logo_manual.png")
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    from jobs import update_job

    update_job(job["id"], audio_path=str(audio_path))
    background.add_task(start_job, job["id"])
    return {"job_id": job["id"], "status": "queued"}


@app.get("/api/jobs/{job_id}")
def get_audio_job(job_id: str) -> dict:
    return _require_job(job_id)


@app.get("/api/jobs/{job_id}/analysis")
def get_analysis(job_id: str) -> JSONResponse:
    _require_job(job_id)
    return _read_json(job_dir(job_id) / "analysis.json", "Analysis is not ready yet")


@app.get("/api/jobs/{job_id}/enrichment")
def get_enrichment(job_id: str) -> JSONResponse:
    _require_job(job_id)
    return _read_json(job_dir(job_id) / "enrichment.json", "Enrichment is not ready yet")


@app.get("/api/jobs/{job_id}/preview")
def get_preview(job_id: str) -> dict:
    _require_job(job_id)
    meta_path = job_dir(job_id) / "preview.json"
    if not meta_path.exists():
        raise HTTPException(status_code=409, detail="Preview is not ready yet")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    slides = [
        {"name": name, "url": f"/api/jobs/{job_id}/preview/{name}"}
        for name in meta.get("images") or []
    ]
    stitched = meta.get("stitched")
    return {
        "placeholder": bool(meta.get("placeholder")),
        "reason": meta.get("reason"),
        "slides": slides,
        "stitched_url": f"/api/jobs/{job_id}/preview/{stitched}" if stitched else None,
    }


@app.get("/api/jobs/{job_id}/preview/{filename}")
def get_preview_image(job_id: str, filename: str) -> FileResponse:
    _require_job(job_id)
    if not re.fullmatch(r"[A-Za-z0-9._-]+", filename):
        raise HTTPException(status_code=400, detail="Invalid preview filename")
    preview_dir = (job_dir(job_id) / "preview").resolve()
    path = (preview_dir / filename).resolve()
    if preview_dir not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Preview image not found")
    return FileResponse(path, media_type="image/png")


@app.get("/api/jobs/{job_id}/download")
def download_deck(job_id: str) -> FileResponse:
    job = _require_job(job_id)
    path = job_dir(job_id) / "deck.pptx"
    if not path.exists():
        raise HTTPException(status_code=409, detail="Deck is not ready yet")
    filename = f"demo-to-deck-{job['id'][:8]}.pptx"
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=filename,
    )
