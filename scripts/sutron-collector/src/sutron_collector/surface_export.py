"""Render collected batches as SURFACE's native CSV ingestion format.

SURFACE (the GMS climate data management system) reads observation files with
``wx/decoders/surface.py``:

    pd.read_csv(filename, sep=";", parse_dates=["datetime"])

The first column is ``datetime``; every other column header is a SURFACE
``Variable.symbol``. The station is identified by the filename, and the
sampling interval is inferred from the timestamps.

Targeting this existing format means no new decoder is needed inside SURFACE,
which keeps the ADR-0010 principle of adding no bridge code. Once the file is
ingested, SURFACE's built-in publisher carries the data on to wis2box and the
WIS2 global network.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime

from sutron_collector.models import CollectedBatch

SEPARATOR = ";"
DATETIME_COLUMN = "datetime"


# SURFACE stores Variable.name as varchar(40) and Variable.symbol as a short
# code; a longer name is rejected by the database, not truncated.
SURFACE_NAME_MAX = 40


@dataclass(frozen=True, slots=True)
class VariableSpec:
    """A SURFACE variable that must exist before ingestion will work."""

    symbol: str
    name: str
    unit: str
    reason: str

    def __post_init__(self) -> None:
        if len(self.name) > SURFACE_NAME_MAX:
            raise ValueError(
                f"variable name {self.name!r} is {len(self.name)} characters; "
                f"SURFACE allows {SURFACE_NAME_MAX}"
            )


# Sutron logger tag -> SURFACE Variable.symbol.
#
# Confirmed against surface/api/fixtures/wx_variable.json. The four pressure
# tags are genuinely different quantities and are kept distinct rather than
# collapsed onto the two stock pressure variables:
#
#   BARO  raw barometer reading at the station
#   QFE   pressure reduced to station elevation
#   QNH   altimeter setting (ISA reduction to sea level)
#   QFF   pressure reduced to sea level using actual temperature
SUTRON_TO_SURFACE: dict[str, str] = {
    # temperature and moisture
    "AT": "TEMP",
    "ATMIN": "TEMPMIN",
    "ATMAX": "TEMPMAX",
    "DP": "TDEWPNT",
    "RH": "RH",
    # precipitation
    "RAIN": "PRECIP",
    # wind: averaged and instantaneous stay separate
    "WSA": "WNDSPAVG",
    "WDA": "WNDDAVG",
    "WSI": "WNDSPD",
    "WDI": "WNDDIR",
    "GUST": "WNDSPMAX",
    "GUSTDIR": "WNDGUSTD",
    # pressure
    "BARO": "PRESSTN",
    "QNH": "PRESSEA",
    "QFE": "PRESQFE",
    "QFF": "PRESQFF",
    # housekeeping
    "BATTERY": "BATTERY",
}


# Symbols above that stock SURFACE does not define. Create these in SURFACE
# (Admin -> Variables) before the first ingestion, or those columns are
# skipped with "variable with symbol X not found".
NEW_SURFACE_VARIABLES: dict[str, VariableSpec] = {
    "PRESQFE": VariableSpec(
        symbol="PRESQFE",
        name="Pressure QFE (station elevation)",
        unit="hPa",
        reason=(
            "SURFACE ships PRESSTN for station-level pressure, which BARO "
            "already uses. QFE is a distinct reduction and needs its own "
            "variable rather than overwriting the raw barometer reading."
        ),
    ),
    "PRESQFF": VariableSpec(
        symbol="PRESQFF",
        name="Pressure QFF (sea level, actual T)",
        unit="hPa",
        reason=(
            "SURFACE ships PRESSEA for sea-level pressure, which QNH already "
            "uses. QFF reduces using actual temperature rather than the ISA "
            "atmosphere, so the two are not interchangeable."
        ),
    ),
    "WNDGUSTD": VariableSpec(
        symbol="WNDGUSTD",
        name="Wind Gust Direction",
        unit="degrees",
        reason=(
            "SURFACE defines sixteen wind variables but none for gust "
            "direction. It is operationally significant at an airport, so it "
            "is added rather than discarded or mapped onto WNDDOM, which "
            "means something else."
        ),
    ),
}


class UnmappedTagsError(ValueError):
    """Raised when a batch carries tags with no SURFACE variable."""


def snap_to_minute(moment: datetime) -> datetime:
    """Drop seconds so consecutive readings sit an exact interval apart.

    SURFACE infers the sampling interval from the gaps between timestamps, so
    a poll at 15:05:03 followed by one at 15:15:07 looks like 604 seconds
    rather than 600. Truncating to the minute makes every gap exact.

    The minute is the right unit rather than the ten-minute slot: the collector
    polls at :05, :15, :25 to stay clear of the legacy poller, and those sit
    exactly halfway between ten-minute boundaries, so snapping to that grid
    would be ambiguous. Truncating to the minute is unambiguous at any offset.

    The unmodified poll time is still available on the batch itself; only the
    value written for ingestion is snapped.
    """
    return moment.replace(second=0, microsecond=0)


def surface_filename(
    station_code: str,
    *,
    at: datetime | None = None,
    month: datetime | None = None,
) -> str:
    """Build the filename SURFACE parses the station code out of.

    ``surface.py`` extracts the code with ``basename(file).split("_")[1]``, so
    a code containing an underscore would silently identify the wrong station.
    The suffix after the code is ignored by that split, which leaves it free to
    carry a timestamp.

    Pass ``at`` for a per-reading name. Without it every poll writes the same
    filename and each reading overwrites the one before -- data loss whenever
    ingestion has not run in the interval.
    """
    if not station_code:
        raise ValueError("station code cannot be empty")
    if "_" in station_code:
        raise ValueError(
            f"station code {station_code!r} cannot contain an underscore: "
            "SURFACE splits the filename on underscores to find the code"
        )

    if at is not None:
        return f"surface_{station_code}_{at:%Y%m%d-%H%M}.csv"
    if month is not None:
        return f"surface_{station_code}_{month:%Y-%m}.csv"
    return f"surface_{station_code}.csv"


def _resolve_columns(
    batches: Sequence[CollectedBatch], *, skip_unmapped: bool
) -> list[str]:
    """Collect every tag across all batches, in first-seen order."""
    tags: list[str] = []
    unmapped: list[str] = []

    for batch in batches:
        for observation in batch.observations:
            if observation.tag in tags or observation.tag in unmapped:
                continue
            if observation.tag in SUTRON_TO_SURFACE:
                tags.append(observation.tag)
            else:
                unmapped.append(observation.tag)

    if unmapped and not skip_unmapped:
        raise UnmappedTagsError(
            "no SURFACE variable mapped for: "
            + ", ".join(sorted(unmapped))
            + ". Add them to SUTRON_TO_SURFACE, or pass skip_unmapped=True to "
            "drop them deliberately."
        )

    return tags


def render_surface_csv(
    batches: Iterable[CollectedBatch], *, skip_unmapped: bool = False
) -> str:
    """Render batches as one SURFACE CSV.

    Every row carries every column so the shape stays rectangular; a reading
    absent from a given batch is left blank, which pandas reads as NaN and
    SURFACE drops per-variable rather than inserting a wrong value.

    Timestamps are written with an explicit UTC offset. SURFACE only applies
    its own station offset to naive timestamps, so being explicit makes the
    reading unambiguous regardless of how the station record is configured.

    Values are rendered straight from ``Decimal``. There is no float
    conversion anywhere in this path, so the hundredth-losing bug in the
    legacy exporter cannot recur here.
    """
    ordered = list(batches)
    if not ordered:
        raise ValueError("cannot render an empty CSV: no batches supplied")

    tags = _resolve_columns(ordered, skip_unmapped=skip_unmapped)
    if not tags:
        raise ValueError("no mappable observations in any batch")

    header = SEPARATOR.join(
        [DATETIME_COLUMN] + [SUTRON_TO_SURFACE[tag] for tag in tags]
    )

    lines = [header]
    for batch in ordered:
        values = {o.tag: o.value for o in batch.observations}
        cells = [snap_to_minute(batch.collected_at).isoformat()]
        cells.extend(
            str(values[tag]) if tag in values else "" for tag in tags
        )
        lines.append(SEPARATOR.join(cells))

    return "\n".join(lines) + "\n"
