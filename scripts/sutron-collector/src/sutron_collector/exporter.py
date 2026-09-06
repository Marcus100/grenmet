"""Render a collected batch as the CIMH `.asc` file.

The format is a contract with an external regional centre, so this module
mirrors the legacy `Create_FTP` function rather than improving on it. Where
legacy's behaviour is merely odd it is reproduced; where it silently corrupts
data it is corrected, and the old behaviour is available behind a flag so
output can still be byte-compared against archived files.
"""

from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sutron_collector.models import CollectedBatch

# Legacy wrote local time via strftime(localtime()). The edge PC runs on
# Atlantic Standard Time, which Grenada observes year round -- there is no
# daylight saving, so a fixed offset is exact rather than an approximation.
STATION_TZ = timezone(timedelta(hours=-4))

# Placeholders for day, month, year, hour, minute. Italian-derived, and part of
# the format CIMH already parses, so it is reproduced verbatim.
HEADER_PREFIX = "gg mm aa hh nn "

DEFAULT_MULTIPLIER = 100


def scale_value(
    value: Decimal, multiplier: int, *, legacy_float: bool = False
) -> str:
    """Scale a reading to the integer the `.asc` carries.

    The file has no decimal points: every value is multiplied (by 100 at
    Maurice Bishop) and written as a whole number, which the ingester later
    divides back out.

    Legacy computed ``int(float(text) * multiplier)``. Binary floating point
    cannot represent most decimal fractions exactly, so ``78.1 * 100`` is
    ``7809.999999999999`` and truncation yields ``7809`` -- the reading loses a
    hundredth on its way to the regional centre. Roughly one value in twenty is
    affected, depending on the decimal.

    Decimal arithmetic is exact, so the default path does not have the bug.
    Pass ``legacy_float=True`` to reproduce it when byte-comparing against
    archived files.
    """
    if legacy_float:
        return str(int(float(value) * multiplier))

    scaled = (value * multiplier).to_integral_value(rounding=ROUND_HALF_UP)
    return str(int(scaled))


def asc_filename(collected_at: datetime, *, tz: timezone = STATION_TZ) -> str:
    """Build the `YYYYMMDD_HHMM.asc` name legacy used, in station local time."""
    local = collected_at.astimezone(tz)
    return f"{local:%Y%m%d}_{local:%H%M}.asc"


def render_asc(
    batch: CollectedBatch,
    *,
    multiplier: int = DEFAULT_MULTIPLIER,
    legacy_float: bool = False,
    tz: timezone = STATION_TZ,
) -> str:
    """Render one batch as the two-line `.asc` body CIMH receives.

    Line one names the columns, line two carries the timestamp and the scaled
    values. Only sensors actually reported get a column, which is why the
    ingester matches by name rather than position -- the column set changes
    when sensors fail or are removed.

    Quality flags are deliberately excluded. They have never been part of this
    file, and adding a column would break the contract. They are retained in
    our own storage instead.
    """
    names = [f"{batch.station_name}.{o.tag}" for o in batch.observations]

    header = HEADER_PREFIX + "".join(f"{name} " for name in names)

    local = batch.collected_at.astimezone(tz)
    row = f"{local:%d} {local:%m} {local:%y} {local:%H} {local:%M} "

    for name, obs in zip(names, batch.observations, strict=True):
        text = scale_value(obs.value, multiplier, legacy_float=legacy_float)

        # Legacy padded with `for k in range(0, len(name) - len(text))`. A
        # negative count runs zero times, so an over-long value simply breaks
        # the alignment. max(0, ...) reproduces that exactly.
        row += " " * max(0, len(name) - len(text)) + text + " "

    # Legacy wrote a newline after the data row and then two more, leaving two
    # blank lines at the end of every file.
    return f"{header}\n{row}\n\n\n"
