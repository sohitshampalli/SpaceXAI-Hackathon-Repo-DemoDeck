"""Local transcription with faster-whisper. No external API calls."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_MODEL = None
_MODEL_KEY: tuple[str, str, str] | None = None


def _resolve_model() -> tuple[str, str, str]:
    """Return model size, device, and compute type.

    CPU uses WHISPER_MODEL_SIZE (default small.en). A CUDA GPU switches to
    medium.en for higher accuracy.
    """
    try:
        import torch

        gpu = bool(torch.cuda.is_available())
    except Exception:
        gpu = False

    if gpu:
        return "medium.en", "cuda", "float16"

    size = os.getenv("WHISPER_MODEL_SIZE", "small.en").strip() or "small.en"
    return size, "cpu", "int8"


def _get_model():
    global _MODEL, _MODEL_KEY
    from faster_whisper import WhisperModel

    key = _resolve_model()
    if _MODEL is None or _MODEL_KEY != key:
        size, device, compute_type = key
        logger.info("Loading faster-whisper model %s on %s (%s)", size, device, compute_type)
        threads = os.cpu_count() or 4
        _MODEL = WhisperModel(
            size,
            device=device,
            compute_type=compute_type,
            cpu_threads=threads,
        )
        _MODEL_KEY = key
    return _MODEL


def _release_model() -> None:
    """Drop the Whisper model so Ollama can use the same RAM."""
    global _MODEL, _MODEL_KEY
    _MODEL = None
    _MODEL_KEY = None
    import gc

    gc.collect()


def transcribe(audio_path: str) -> str:
    """Transcribe an audio file to a single undiarized transcript."""
    try:
        model = _get_model()
        segments, _info = model.transcribe(
            audio_path,
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
            language="en",
        )
        parts: list[str] = []
        for segment in segments:
            text = (segment.text or "").strip()
            if text:
                parts.append(text)
        return " ".join(parts).strip()
    finally:
        _release_model()
