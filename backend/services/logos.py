"""Download an enrichment logo without ever failing the job."""

from __future__ import annotations

import logging
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image

logger = logging.getLogger(__name__)


def download_logo(url: str, dest: Path) -> Path | None:
    if not url or not url.startswith(("http://", "https://")):
        logger.warning("Ignoring logo URL that is not http(s)")
        return None
    try:
        request = Request(url, headers={"User-Agent": "DemoToDeck/1.0"})
        with urlopen(request, timeout=15) as response:
            payload = response.read(5_000_001)
        if len(payload) < 32 or len(payload) > 5_000_000:
            logger.warning("Logo download was empty or too large")
            return None
        image = Image.open(BytesIO(payload))
        image = image.convert("RGBA")
        dest.parent.mkdir(parents=True, exist_ok=True)
        image.save(dest, format="PNG")
        return dest
    except Exception:
        logger.warning("Could not download enrichment logo", exc_info=True)
        return None
