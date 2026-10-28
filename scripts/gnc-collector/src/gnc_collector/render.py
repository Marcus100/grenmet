"""Render one ABI Cloud and Moisture Imagery band over an area as a PNG."""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.figure import Figure
from netCDF4 import Dataset

from gnc_collector.goes import Area, Projection, crop_window

GRENADA = (12.05, -61.75)  # lat, lon of Maurice Bishop International Airport


@dataclass(frozen=True, slots=True)
class Band:
    key: str
    title: str
    unit: str
    vmin: float
    vmax: float
    colours: tuple[tuple[float, str], ...]


# Infrared: warm surfaces grey, cold (high) cloud tops through blue, green,
# yellow and red so deep convection stands out. Values are Celsius.
INFRARED = (
    (0.0, "#ffffff"),
    (0.25, "#ff0000"),
    (0.33, "#ffff00"),
    (0.41, "#00ff00"),
    (0.5, "#0000ff"),
    (0.5, "#e0e0e0"),
    (1.0, "#000000"),
)
WATER_VAPOUR = (
    (0.0, "#ffffff"),
    (0.3, "#00a0ff"),
    (0.55, "#003080"),
    (0.75, "#a06020"),
    (1.0, "#000000"),
)

BANDS = {
    13: Band("ir", "Clean infrared (band 13)", "°C", -80.0, 40.0, INFRARED),
    8: Band("wv", "Upper-level water vapour (band 8)", "°C", -75.0, -5.0, WATER_VAPOUR),
}


def read_window(
    path: Path, area: Area
) -> tuple[np.ndarray, Projection, tuple[float, ...]]:
    """Brightness temperature (°C) for the area, its projection and extent (m)."""
    with Dataset(path) as dataset:
        attrs = dataset.variables["goes_imager_projection"]
        projection = Projection(
            semi_major=float(attrs.semi_major_axis),
            semi_minor=float(attrs.semi_minor_axis),
            height=float(attrs.perspective_point_height),
            lon0=float(attrs.longitude_of_projection_origin),
        )
        x = np.asarray(dataset.variables["x"][:], dtype=float)
        y = np.asarray(dataset.variables["y"][:], dtype=float)
        rows, columns = crop_window(projection, x, y, area)
        data = dataset.variables["CMI"][rows, columns]
    kelvin = np.ma.filled(np.ma.masked_invalid(data).astype(float), np.nan)
    h = projection.height
    # imshow extent in projection metres: scan angle (radians) times height.
    extent = (
        x[columns.start] * h,
        x[columns.stop - 1] * h,
        y[rows.stop - 1] * h,
        y[rows.start] * h,
    )
    return kelvin - 273.15, projection, extent


def render(
    path: Path,
    band: Band,
    area: Area,
    scan_start: datetime,
    output: Path,
    *,
    coastlines: bool = True,
) -> tuple[int, int]:
    """Write the PNG atomically and return its (width, height) in pixels."""
    celsius, projection, extent = read_window(path, area)
    # An explicit Agg canvas: no pyplot global state, no display needed.
    figure = Figure(figsize=(8, 8), dpi=100)
    FigureCanvasAgg(figure)
    cmap = LinearSegmentedColormap.from_list(band.key, list(band.colours))
    if coastlines:
        import cartopy.crs as ccrs
        import cartopy.feature as cfeature

        geos = ccrs.Geostationary(
            central_longitude=projection.lon0,
            satellite_height=projection.height,
            globe=ccrs.Globe(
                semimajor_axis=projection.semi_major,
                semiminor_axis=projection.semi_minor,
            ),
        )
        axes = figure.add_subplot(1, 1, 1, projection=ccrs.PlateCarree())
        axes.set_extent(
            [area.west, area.east, area.south, area.north], ccrs.PlateCarree()
        )
        image = axes.imshow(
            celsius,
            origin="upper",
            extent=extent,
            transform=geos,
            cmap=cmap,
            vmin=band.vmin,
            vmax=band.vmax,
            interpolation="nearest",
        )
        axes.add_feature(
            cfeature.COASTLINE.with_scale("10m"), edgecolor="#ffd000", linewidth=0.6
        )
        axes.gridlines(draw_labels=True, linewidth=0.3, color="#808080", alpha=0.6)
        axes.plot(
            GRENADA[1], GRENADA[0], "w+", markersize=8, transform=ccrs.PlateCarree()
        )
    else:
        axes = figure.add_subplot(1, 1, 1)
        image = axes.imshow(celsius, cmap=cmap, vmin=band.vmin, vmax=band.vmax)
        axes.set_axis_off()
    figure.colorbar(
        image,
        ax=axes,
        orientation="horizontal",
        pad=0.05,
        fraction=0.04,
        label=band.unit,
    )
    axes.set_title(
        f"GOES-19 {band.title} · {area.title}\n"
        f"{scan_start:%Y-%m-%d %H:%M} UTC · GeoNetCast Americas",
        fontsize=10,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp.png")
    figure.savefig(temporary, bbox_inches="tight")
    temporary.replace(output)
    return png_size(output)


def png_size(path: Path) -> tuple[int, int]:
    """Width and height from the PNG header (bbox cropping changes the canvas)."""
    with path.open("rb") as stream:
        header = stream.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")
    return int.from_bytes(header[16:20]), int.from_bytes(header[20:24])
