"""Render deck slides to PNG. LibreOffice is preferred; otherwise a labeled placeholder."""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation

logger = logging.getLogger(__name__)


def _slide_count(deck_path: Path) -> int:
    return len(Presentation(str(deck_path)).slides)


def _run(command: list[str], env: dict | None = None) -> subprocess.CompletedProcess:
    logger.info("Running preview command: %s", " ".join(command))
    return subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=180,
        env=env,
    )


def _normalize_pngs(preview_dir: Path, expected: int) -> list[Path]:
    named = sorted(preview_dir.glob("slide-*.png"))
    if len(named) >= expected:
        return named
    pngs = sorted(path for path in preview_dir.glob("*.png") if path.name != "stitched.png")
    if len(pngs) < expected:
        return []
    normalized: list[Path] = []
    for index, path in enumerate(pngs, start=1):
        target = preview_dir / f"slide-{index}.png"
        if path.resolve() != target.resolve():
            path.replace(target)
        normalized.append(target)
    return normalized


def _convert_with_soffice(deck_path: Path, preview_dir: Path, expected: int) -> list[Path]:
    soffice = shutil.which("soffice")
    if not soffice:
        raise FileNotFoundError("soffice unavailable")

    profile = preview_dir.parent / "lo-profile"
    profile.mkdir(parents=True, exist_ok=True)
    env = dict(**{key: value for key, value in __import__("os").environ.items()})
    env["HOME"] = "/tmp"

    exact = [soffice, "--headless", "--convert-to", "png", "--outdir", str(preview_dir), str(deck_path)]
    result = _run(exact, env=env)
    if result.returncode != 0:
        logger.warning("soffice png convert failed: %s", (result.stderr or result.stdout or "").strip())

    images = _normalize_pngs(preview_dir, expected)
    if len(images) >= expected:
        return images

    # LibreOffice's png filter exports the first slide only. Render every slide via PDF.
    pdf_cmd = [
        soffice,
        "--headless",
        f"-env:UserInstallation=file://{profile}",
        "--convert-to",
        "pdf",
        "--outdir",
        str(preview_dir),
        str(deck_path),
    ]
    pdf_result = _run(pdf_cmd, env=env)
    pdf_path = preview_dir / f"{deck_path.stem}.pdf"
    if pdf_result.returncode != 0 or not pdf_path.exists():
        detail = (pdf_result.stderr or pdf_result.stdout or "pdf conversion produced no file").strip()
        raise RuntimeError(detail)

    pdftoppm = shutil.which("pdftoppm")
    if not pdftoppm:
        raise RuntimeError("pdftoppm is required to rasterize every slide")
    raster = _run([pdftoppm, "-png", str(pdf_path), str(preview_dir / "slide")], env=env)
    if raster.returncode != 0:
        raise RuntimeError((raster.stderr or raster.stdout or "pdftoppm failed").strip())

    for leftover in preview_dir.glob("*.png"):
        if leftover.name == "stitched.png":
            continue
        if not leftover.name.startswith("slide-"):
            leftover.unlink(missing_ok=True)
    images = sorted(preview_dir.glob("slide-*.png"))
    if len(images) < expected:
        raise RuntimeError(f"Preview rendered {len(images)} slides, expected {expected}")
    pdf_path.unlink(missing_ok=True)
    return images


def _font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def _placeholder(preview_dir: Path, expected: int) -> list[Path]:
    """Draw one card per slide and a vertical contact sheet. This is an explicit fallback."""
    preview_dir.mkdir(parents=True, exist_ok=True)
    cards: list[Image.Image] = []
    paths: list[Path] = []
    title_font = _font(42)
    body_font = _font(24)
    for index in range(1, max(expected, 1) + 1):
        image = Image.new("RGB", (1280, 720), "#F6F4EF")
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, 18, 720), fill="#14324A")
        draw.text((64, 80), f"Slide {index}", fill="#14324A", font=title_font)
        draw.text(
            (64, 180),
            "LibreOffice is not available, so this is a placeholder preview.\nThe PowerPoint download is still the real deck.",
            fill="#3D4A57",
            font=body_font,
        )
        path = preview_dir / f"slide-{index}.png"
        image.save(path, format="PNG")
        cards.append(image)
        paths.append(path)
    width = max(card.width for card in cards)
    height = sum(card.height for card in cards)
    sheet = Image.new("RGB", (width, height), "#FFFFFF")
    offset = 0
    for card in cards:
        sheet.paste(card, (0, offset))
        offset += card.height
    sheet.save(preview_dir / "stitched.png", format="PNG")
    return paths


def render_preview(deck_path: Path, preview_dir: Path) -> dict:
    """Return preview metadata. Missing soffice is flagged, not swallowed."""
    preview_dir.mkdir(parents=True, exist_ok=True)
    for old in preview_dir.glob("*"):
        if old.is_file():
            old.unlink()
    expected = _slide_count(deck_path)
    soffice_missing = shutil.which("soffice") is None
    if soffice_missing:
        logger.warning("soffice is not installed; writing placeholder slide previews")
        images = _placeholder(preview_dir, expected)
        return {
            "placeholder": True,
            "reason": "soffice unavailable",
            "images": [path.name for path in images],
            "stitched": "stitched.png",
        }
    try:
        images = _convert_with_soffice(deck_path, preview_dir, expected)
        return {
            "placeholder": False,
            "reason": None,
            "images": [path.name for path in images],
            "stitched": None,
        }
    except Exception:
        logger.warning("Slide rasterization failed; writing an explicit placeholder", exc_info=True)
        images = _placeholder(preview_dir, expected)
        return {
            "placeholder": True,
            "reason": "slide rasterization failed",
            "images": [path.name for path in images],
            "stitched": "stitched.png",
        }
