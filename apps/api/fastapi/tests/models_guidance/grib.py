"""Tiny synthetic GRIB2 files written with ecCodes (no network, no binary fixtures)."""

import importlib
from pathlib import Path

import numpy as np

# Bind pyproj's PROJ before ecCodes loads eckitlib's copy, as gms_ingest and
# src.models_guidance.extract do; the reverse order aborts at shutdown.
try:
    importlib.import_module("pyproj")
except ImportError:
    pass
eccodes = importlib.import_module("eccodes")

LATS = np.arange(13.0, 11.49, -0.25)  # 13.0 .. 11.5
LONS = np.arange(298.0, 299.51, 0.25)  # -62.0 .. -60.5 on a 0-360 grid


def write_message(
    handle,
    *,
    short_name: str,
    level_type: int,
    level: int,
    value: float | np.ndarray,
    start: int,
    end: int,
    step_type: str = "instant",
    date: int = 20261018,
    hour: int = 0,
) -> None:
    message = eccodes.codes_grib_new_from_samples("regular_ll_sfc_grib2")
    try:
        for key, setting in {
            "Ni": len(LONS),
            "Nj": len(LATS),
            "latitudeOfFirstGridPointInDegrees": float(LATS[0]),
            "latitudeOfLastGridPointInDegrees": float(LATS[-1]),
            "longitudeOfFirstGridPointInDegrees": float(LONS[0]),
            "longitudeOfLastGridPointInDegrees": float(LONS[-1]),
            "iDirectionIncrementInDegrees": 0.25,
            "jDirectionIncrementInDegrees": 0.25,
            "dataDate": date,
            "dataTime": hour * 100,
            "shortName": short_name,
            "typeOfFirstFixedSurface": level_type,
            "level": level,
            "stepType": step_type,
        }.items():
            eccodes.codes_set(message, key, setting)
        if step_type == "instant":
            eccodes.codes_set(message, "step", end)
        else:
            eccodes.codes_set(message, "startStep", start)
            eccodes.codes_set(message, "endStep", end)
        grid = np.broadcast_to(value, (len(LATS), len(LONS))).astype(float)
        eccodes.codes_set_values(message, grid.ravel())
        eccodes.codes_write(message, handle)
    finally:
        eccodes.codes_release(message)


def write_step(
    handle,
    step: int,
    *,
    temp_k: float,
    u: float = 3.0,
    v: float = 4.0,
    gust: float | None = None,
    cloud: float = 0.5,
    accumulations: tuple[tuple[int, float], ...] = (),
) -> None:
    """One forecast hour. ``accumulations`` are ``(startStep, total)`` for tp."""
    write_message(
        handle,
        short_name="2t",
        level_type=103,
        level=2,
        value=temp_k,
        start=step,
        end=step,
    )
    write_message(
        handle,
        short_name="10u",
        level_type=103,
        level=10,
        value=u,
        start=step,
        end=step,
    )
    write_message(
        handle,
        short_name="10v",
        level_type=103,
        level=10,
        value=v,
        start=step,
        end=step,
    )
    write_message(
        handle,
        short_name="msl",
        level_type=101,
        level=0,
        value=101500.0,
        start=step,
        end=step,
    )
    write_message(
        handle,
        short_name="tcc",
        level_type=1,
        level=0,
        value=cloud,
        start=step,
        end=step,
    )
    if gust is not None:
        write_message(
            handle,
            short_name="10fg",
            level_type=103,
            level=10,
            value=gust,
            start=step,
            end=step,
        )
    for start, total in accumulations:
        write_message(
            handle,
            short_name="tp",
            level_type=1,
            level=0,
            value=total,
            start=start,
            end=step,
            step_type="accum",
        )


def write_grib(path: Path, steps: list[dict]) -> Path:
    with path.open("wb") as handle:
        for spec in steps:
            write_step(handle, **spec)
    return path
