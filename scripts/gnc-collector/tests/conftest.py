import os
import time
from pathlib import Path

import numpy as np
import pytest
from netCDF4 import Dataset

from gnc_collector.goes import CARIBBEAN, Projection, scan_angles

# GOES-19 (GOES-East) values from a real full-disk file's goes_imager_projection.
GOES19 = Projection(
    semi_major=6378137.0,
    semi_minor=6356752.31414,
    height=35786023.0,
    lon0=-75.2,
)

NAME = (
    "OR_ABI-L2-CMIPF-M6C{band:02d}_G19_s2026299{hhmm}212"
    "_e2026299{hhmm}532_c2026299{hhmm}011.nc"
)


def write_scan(path: Path, band: int = 13, size: int = 80) -> Path:
    """A miniature full-disk CMIP file: real projection, grid around the area."""
    corners = [
        scan_angles(GOES19, lat, lon)
        for lat in (CARIBBEAN.south - 2, CARIBBEAN.north + 2)
        for lon in (CARIBBEAN.west - 2, CARIBBEAN.east + 2)
    ]
    xs, ys = [c[0] for c in corners], [c[1] for c in corners]
    path.parent.mkdir(parents=True, exist_ok=True)
    with Dataset(path, "w") as dataset:
        dataset.createDimension("x", size)
        dataset.createDimension("y", size)
        x = dataset.createVariable("x", "f8", ("x",))
        y = dataset.createVariable("y", "f8", ("y",))
        x[:] = np.linspace(min(xs), max(xs), size)
        y[:] = np.linspace(max(ys), min(ys), size)  # ABI rows run north to south
        projection = dataset.createVariable("goes_imager_projection", "i4")
        projection.semi_major_axis = GOES19.semi_major
        projection.semi_minor_axis = GOES19.semi_minor
        projection.perspective_point_height = GOES19.height
        projection.longitude_of_projection_origin = GOES19.lon0
        cmi = dataset.createVariable("CMI", "f4", ("y", "x"), fill_value=-1.0)
        field = np.linspace(200, 300, size * size, dtype="f4").reshape(size, size)
        field[0, 0] = -1.0  # one fill pixel, as at the disk edge
        cmi[:] = field
        dataset.band = band
    return path


@pytest.fixture
def receiver(tmp_path: Path) -> Path:
    """FAZZT-like folder with two settled scans per band and one still growing."""
    root = tmp_path / "fazzt" / "GOES-R"
    old = time.time() - 600
    for hhmm in ("1200", "1210"):
        for band in (13, 8):
            scan = write_scan(root / NAME.format(band=band, hhmm=hhmm), band=band)
            os.utime(scan, (old, old))
    write_scan(root / NAME.format(band=13, hhmm="1220"))  # mtime now: unsettled
    (root / "README.txt").write_text("not a scan")
    write_scan(
        root
        / "OR_ABI-L2-CMIPC-M6C13_G19_s20262991201171_e20262991203544_c20262991204049.nc"
    )
    return root
