"""CAP image renderer tests (pure Pillow — no DB, no storage, no network)."""

from src.cap.images import render_area_map, render_social_image

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def test_render_social_image_returns_png() -> None:
    png = render_social_image(
        identifier="GRD-2026-001",
        headline="Flash Flood Warning for St. George's and surrounding parishes",
        severity="Severe",
        area_desc="St. George's",
    )
    assert png[:8] == _PNG_MAGIC
    assert len(png) > 500


def test_render_area_map_with_polygons_returns_png() -> None:
    polygons = [[[-61.75, 12.05], [-61.74, 12.05], [-61.74, 12.06], [-61.75, 12.06]]]
    png = render_area_map(
        polygons=polygons, identifier="GRD-2026-001", area_desc="St. George's"
    )
    assert png is not None
    assert png[:8] == _PNG_MAGIC


def test_render_area_map_without_geometry_returns_none() -> None:
    assert render_area_map(polygons=[], identifier="x", area_desc="") is None
