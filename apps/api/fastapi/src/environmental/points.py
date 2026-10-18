"""Fixed Grenada and Carriacou points the series are extracted for."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class Point:
    id: str
    name: str
    lat: float
    lon: float


POINTS: tuple[Point, ...] = (
    Point("st-georges", "St George's (west coast)", 12.05, -61.80),
    Point("grenada-east", "Grenada east (Atlantic)", 12.12, -61.55),
    Point("grenada-south", "Grenada south (Point Salines)", 11.95, -61.78),
    Point("carriacou", "Carriacou", 12.50, -61.45),
)
POINT_IDS: tuple[str, ...] = tuple(p.id for p in POINTS)

# Request box covering all points, with a margin of a few model cells.
BBOX_WEST, BBOX_SOUTH, BBOX_EAST, BBOX_NORTH = -62.10, 11.80, -61.20, 12.70

ATTRIBUTION_MARINE = (
    "Generated using E.U. Copernicus Marine Service Information; "
    "https://doi.org/10.48670/moi-00017 (waves), "
    "https://doi.org/10.48670/moi-00016 (physics) - used under the Copernicus "
    "Marine licence. Not a GMS product."
)
ATTRIBUTION_AIR = (
    "Contains modified Copernicus Atmosphere Monitoring Service information "
    "(CAMS global atmospheric composition forecasts), used under the Copernicus "
    "licence. Neither the European Commission nor ECMWF is responsible for any "
    "use of the information. Not a GMS product."
)


PointId = Literal["st-georges", "grenada-east", "grenada-south", "carriacou"]


def get_point(point_id: str) -> Point:
    for point in POINTS:
        if point.id == point_id:
            return point
    raise KeyError(point_id)
