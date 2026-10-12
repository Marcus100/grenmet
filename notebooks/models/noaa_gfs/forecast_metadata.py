"""Record requested GFS forecast identity without inspecting GRIB messages."""

import json
import os
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile


class ForecastMetadataError(OSError):
    """A sidecar could not be removed or published; the download is not complete."""


def metadata_path(target: Path) -> Path:
    """Keep the full GRIB filename in the sidecar name."""
    return target.with_name(f"{target.name}.metadata.json")


def build_forecast_metadata(
    initialization_time: datetime,
    model: str,
    product: str,
    field_filter: str,
    forecast_hours: Iterable[int],
) -> dict[str, object]:
    """Describe requested times, normalizing an explicitly aware run to UTC."""
    if initialization_time.utcoffset() is None:
        raise ValueError("initialization_time must include a timezone")
    run = initialization_time.astimezone(UTC)
    hours = list(forecast_hours)
    if not hours:
        raise ValueError("At least one forecast hour is required")
    if any(type(hour) is not int or hour < 0 for hour in hours):
        raise ValueError("Forecast hours must be non-negative integers")

    def utc_text(value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")

    return {
        "schema_version": 1,
        "model": model,
        "product": product,
        "initialization_time": utc_text(run),
        "requested_field_filter": field_filter,
        "requested_forecasts": [
            {"forecast_hour": hour, "valid_time": utc_text(run + timedelta(hours=hour))}
            for hour in hours
        ],
    }


def remove_forecast_metadata(target: Path) -> None:
    """Invalidate old identity immediately before replacing the GRIB bytes."""
    try:
        metadata_path(target).unlink(missing_ok=True)
    except OSError as error:
        raise ForecastMetadataError(
            f"Could not invalidate metadata for {target}"
        ) from error


def write_forecast_metadata(target: Path, metadata: dict[str, object]) -> Path:
    """Publish complete JSON with an atomic replacement in the same directory."""
    sidecar = metadata_path(target)
    temporary = None
    try:
        with NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=sidecar.parent,
            prefix=f".{sidecar.name}.",
            suffix=".tmp",
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            json.dump(metadata, stream, indent=2, allow_nan=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(sidecar)
    except (OSError, TypeError, ValueError) as error:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError as cleanup_error:
                raise ForecastMetadataError(
                    f"Could not clean up failed metadata write for {target}"
                ) from cleanup_error
        raise ForecastMetadataError(f"Could not write metadata for {target}") from error
    return sidecar
