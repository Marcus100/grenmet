"""GOES-R ABI file names and fixed-grid geometry.

Formulas follow the GOES-R Product Definition and User's Guide (PUG),
volume 3, section 5.1.2.8 ("navigating from latitude/longitude to N/S and E/W
scan angles"). GNC-A rebroadcasts NOAA's files unchanged, so the receiver and
the public `noaa-goes19` bucket share these names and variables.
"""

import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

# OR_ABI-L2-CMIPF-M6C13_G19_s20262991200212_e20262991209532_c20262991210011.nc
FILENAME = re.compile(
    r"^OR_ABI-L2-CMIP(?P<scene>[FCM]\d?)-M(?P<mode>\d)C(?P<band>\d{2})"
    r"_G(?P<satellite>\d{2})_s(?P<start>\d{13})\d_e\d{14}_c\d{14}\.nc$"
)


@dataclass(frozen=True, slots=True)
class ScanFile:
    path: Path
    band: int
    satellite: int
    scene: str
    scan_start: datetime


def parse_name(path: Path) -> ScanFile | None:
    """Return the scan identity, or None for files that are not ABI CMIP."""
    match = FILENAME.match(path.name)
    if match is None:
        return None
    start = datetime.strptime(match["start"], "%Y%j%H%M%S").replace(tzinfo=UTC)
    return ScanFile(
        path=path,
        band=int(match["band"]),
        satellite=int(match["satellite"]),
        scene=match["scene"],
        scan_start=start,
    )


@dataclass(frozen=True, slots=True)
class Projection:
    """The `goes_imager_projection` attributes needed for navigation."""

    semi_major: float
    semi_minor: float
    height: float  # perspective_point_height, metres above the ellipsoid
    lon0: float  # longitude_of_projection_origin, degrees east

    @property
    def distance(self) -> float:
        """H in the PUG: satellite distance from Earth's centre."""
        return self.height + self.semi_major


def scan_angles(projection: Projection, lat: float, lon: float) -> tuple[float, float]:
    """Latitude/longitude (degrees) to fixed-grid (x, y) scan angles (radians)."""
    r_eq, r_pol, big_h = (
        projection.semi_major,
        projection.semi_minor,
        projection.distance,
    )
    eccentricity_sq = 1 - (r_pol / r_eq) ** 2
    phi, lam = math.radians(lat), math.radians(lon - projection.lon0)
    phi_c = math.atan((r_pol / r_eq) ** 2 * math.tan(phi))
    r_c = r_pol / math.sqrt(1 - eccentricity_sq * math.cos(phi_c) ** 2)
    s_x = big_h - r_c * math.cos(phi_c) * math.cos(lam)
    s_y = -r_c * math.cos(phi_c) * math.sin(lam)
    s_z = r_c * math.sin(phi_c)
    x = math.asin(-s_y / math.sqrt(s_x**2 + s_y**2 + s_z**2))
    y = math.atan(s_z / s_x)
    return x, y


@dataclass(frozen=True, slots=True)
class Area:
    key: str
    title: str
    west: float
    east: float
    south: float
    north: float


# Lesser Antilles with Grenada near the centre; the public GMS imagery area.
CARIBBEAN = Area("caribbean", "Eastern Caribbean", -66.0, -56.0, 9.0, 18.0)


def crop_window(
    projection: Projection,
    x: np.ndarray,
    y: np.ndarray,
    area: Area,
    margin: float = 1.0,
) -> tuple[slice, slice]:
    """Row and column slices of the fixed grid that cover the area.

    Only the window is read from disk, so a 5424 x 5424 full disk costs a few
    hundred kilobytes instead of the whole array.
    """
    # Lat/lon box edges curve in scan-angle space, so pad the corners or the
    # warped image leaves an empty sliver along one side.
    corners = [
        scan_angles(projection, lat, lon)
        for lat in (area.south - margin, area.north + margin)
        for lon in (area.west - margin, area.east + margin)
    ]
    xs, ys = [c[0] for c in corners], [c[1] for c in corners]
    columns = np.flatnonzero((x >= min(xs)) & (x <= max(xs)))
    rows = np.flatnonzero((y >= min(ys)) & (y <= max(ys)))
    if columns.size == 0 or rows.size == 0:
        raise ValueError(f"Area {area.key} is outside this scan")
    return (
        slice(int(rows.min()), int(rows.max()) + 1),
        slice(int(columns.min()), int(columns.max()) + 1),
    )
