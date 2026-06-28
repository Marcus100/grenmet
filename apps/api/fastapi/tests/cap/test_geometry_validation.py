"""Geometry validation via shapely (src/cap/validation.py:_validate_geometry)."""

from src.cap.validation import _validate_geometry

_VALID_SQUARE = {
    "type": "Polygon",
    "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
}
_SELF_INTERSECTING = {
    "type": "Polygon",
    "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]],
}


def test_none_geometry_is_ok() -> None:
    assert _validate_geometry(None) is None


def test_valid_polygon_passes() -> None:
    assert _validate_geometry(_VALID_SQUARE) is None


def test_malformed_geometry_flagged() -> None:
    result = _validate_geometry({"type": "Polygon", "coordinates": "not-coords"})
    assert result is not None and "malformed" in result


def test_self_intersecting_polygon_flagged() -> None:
    result = _validate_geometry(_SELF_INTERSECTING)
    assert result is not None and "invalid" in result
