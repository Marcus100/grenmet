"""Climate Bulletin: derived period labels and the printed table rows.

The bulletin reviews one *monitoring month* (the month before issue, stored in
`month`) and gives an outlook for the three-month *season* that starts in the
issue month (issued October: OND). Labels such as "July to September 2026" come
from those two dates; nobody types them. Pure functions, no I/O.
"""

from datetime import date

MONTH_NAMES = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)

# Standardized Precipitation Index categories, driest to wettest (the US
# Drought Monitor / CariCOF wording). Mirrors SPI_CATEGORIES in
# packages/gms/src/products.ts (parity-tested through fields.json).
SPI_CATEGORIES = (
    "Exceptionally Dry",
    "Extremely Dry",
    "Severely Dry",
    "Moderately Dry",
    "Abnormally Dry",
    "Normal",
    "Abnormally Wet",
    "Moderately Wet",
    "Severely Wet",
    "Extremely Wet",
    "Exceptionally Wet",
)

# (key suffix, window in months): the four SPI rows, shortest first.
SPI_WINDOWS = ((1, "spi1"), (3, "spi3"), (6, "spi6"), (12, "spi12"))


def _shift(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def _label(year: int, month: int) -> str:
    return f"{MONTH_NAMES[month - 1]} {year}"


def parse_month(value: str) -> tuple[int, int] | None:
    """`YYYY-MM` as (year, month), or None when it is not a month."""
    try:
        year, month = (int(part) for part in value.strip().split("-"))
    except ValueError:
        return None
    return (year, month) if 1 <= month <= 12 else None


def window_label(value: str, months: int) -> str:
    """The `months` months ending in `value` (YYYY-MM), as printed on the SPI rows.

    1 month: "September 2026"; 3: "July to September 2026"; 12 across a year
    boundary: "October 2025 to September 2026".
    """
    end = parse_month(value)
    if end is None:
        return ""
    if months == 1:
        return _label(*end)
    start = _shift(*end, -(months - 1))
    first = MONTH_NAMES[start[1] - 1] if start[0] == end[0] else _label(*start)
    return f"{first} to {_label(*end)}"


def season(issued: date) -> tuple[str, str]:
    """Outlook season starting in the issue month: ("OND", "October to December 2026").

    The three months are the issue month and the two after it. Across a year
    boundary the label names both years ("November 2026 to January 2027").
    """
    months = [_shift(issued.year, issued.month, step) for step in range(3)]
    code = "".join(MONTH_NAMES[m - 1][0] for _, m in months)
    first, last = months[0], months[-1]
    if first[0] == last[0]:
        label = f"{MONTH_NAMES[first[1] - 1]} to {_label(*last)}"
    else:
        label = f"{_label(*first)} to {_label(*last)}"
    return code, label


def season_year(issued: date) -> str:
    """The year of the outlook season: "2026", or "2026-27" across a year boundary."""
    first = _shift(issued.year, issued.month, 0)[0]
    last = _shift(issued.year, issued.month, 2)[0]
    return str(first) if first == last else f"{first}-{str(last)[-2:]}"


def verification_label(value: str) -> str:
    """The three months ending in `value`, as "July 2026 – September 2026"."""
    end = parse_month(value)
    if end is None:
        return ""
    return f"{_label(*_shift(*end, -2))} – {_label(*end)}"


def range_text(
    low: str, high: str, unit: str = "", *, up_to_when_zero: bool = False
) -> str:
    """ "120 – 180 mm". With `up_to_when_zero`, an empty or zero bottom reads "Up to 2"."""
    low, high = low.strip(), high.strip()
    suffix = f" {unit}" if unit else ""
    if up_to_when_zero and high and low in {"", "0", "0.0"}:
        return f"Up to {high}{suffix}"
    if low and high:
        return f"{low} – {high}{suffix}"
    only = low or high
    return f"{only}{suffix}" if only else "—"
