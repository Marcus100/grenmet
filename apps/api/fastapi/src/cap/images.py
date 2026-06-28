"""Generate alert images with Pillow only — no external tile service (no OSM ToS,
no network). Used by the social-image and static-map publishers.
"""

from __future__ import annotations

import io

from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import MultiPoint  # type: ignore[import-untyped]

_SEVERITY_BG: dict[str, tuple[int, int, int]] = {
    "Extreme": (153, 0, 0),
    "Severe": (204, 85, 0),
    "Moderate": (191, 144, 0),
    "Minor": (90, 110, 40),
    "Unknown": (60, 60, 60),
}


def _font() -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    return ImageFont.load_default()


def _wrap(text: str, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > width:
            if current:
                lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines[:8]


def render_social_image(
    *, identifier: str, headline: str, severity: str, area_desc: str
) -> bytes:
    """1200x630 severity-coloured card suitable for social sharing."""
    width, height = 1200, 630
    img = Image.new("RGB", (width, height), _SEVERITY_BG.get(severity, (60, 60, 60)))
    draw = ImageDraw.Draw(img)
    font = _font()

    draw.text((60, 50), f"{severity.upper()} ALERT", fill=(255, 255, 255), font=font)
    y = 120
    for line in _wrap(headline, 60):
        draw.text((60, y), line, fill=(255, 255, 255), font=font)
        y += 26
    draw.text((60, height - 90), area_desc[:120], fill=(235, 235, 235), font=font)
    draw.text((60, height - 50), identifier, fill=(200, 200, 200), font=font)
    return _to_png(img)


def render_area_map(
    *, polygons: list[list[list[float]]], identifier: str, area_desc: str
) -> bytes | None:
    """Schematic render of area polygons (lon/lat rings) on a plain canvas.

    Returns None when there is no usable geometry. No basemap/tiles are fetched.
    """
    points = [pt for ring in polygons for pt in ring if len(pt) >= 2]
    if not points:
        return None

    width, height, pad = 1000, 1000, 60
    # bbox via shapely (minx, miny, maxx, maxy) over all geometry points
    min_lon, min_lat, max_lon, max_lat = MultiPoint(
        [(p[0], p[1]) for p in points]
    ).bounds
    span_lon = (max_lon - min_lon) or 1e-6
    span_lat = (max_lat - min_lat) or 1e-6

    def project(pt: list[float]) -> tuple[float, float]:
        x = pad + (pt[0] - min_lon) / span_lon * (width - 2 * pad)
        # Flip latitude so north is up.
        y = pad + (max_lat - pt[1]) / span_lat * (height - 2 * pad)
        return (x, y)

    img = Image.new("RGB", (width, height), (245, 245, 245))
    draw = ImageDraw.Draw(img)
    for ring in polygons:
        projected = [project(pt) for pt in ring if len(pt) >= 2]
        if len(projected) >= 2:
            draw.line([*projected, projected[0]], fill=(180, 30, 30), width=3)
    draw.text((20, 20), identifier, fill=(40, 40, 40), font=_font())
    draw.text((20, height - 30), area_desc[:120], fill=(40, 40, 40), font=_font())
    return _to_png(img)


def _to_png(img: Image.Image) -> bytes:
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()
