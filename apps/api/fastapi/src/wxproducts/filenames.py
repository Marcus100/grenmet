"""Download names for weather product PDFs, e.g. ``GMS Morning Forecast 2026-10-23 0700 (rev 3).pdf``."""

from datetime import datetime

from src.utils.filenames import grenada_date, pdf_filename

from .validation import ISSUE_HOURS

PRODUCT_TITLES = {
    "morning": "Morning Forecast",
    "midday": "Midday Forecast",
    "evening": "Evening Forecast",
    "outlook": "Tropical Weather Outlook",
    "cyclone": "Tropical Cyclone Bulletin",
    "marine": "Marine Bulletin",
    "flood": "Flood Bulletin",
    "thunderstorm": "Thunderstorm Bulletin",
    "wind": "Wind Bulletin",
    "heat": "Heat Bulletin",
    "dust": "Dust and Haze Bulletin",
    "coastal": "Coastal Hazard Bulletin",
    "tsunami": "Tsunami Bulletin",
}


def _issue_day(issued_at: str, recorded_at: datetime | None) -> str:
    """Local issue date from ``YYYY-MM-DDTHH:MM``, else the Grenada record date."""
    day = issued_at[:10]
    if len(day) == 10 and day[4] == "-" and day[7] == "-":
        return day
    return grenada_date(recorded_at).isoformat()


def product_pdf_filename(
    kind: str,
    values: dict[str, str],
    *,
    recorded_at: datetime | None,
    revision: int | None = None,
) -> str:
    """Name for a saved revision (``revision`` set) or an unsaved preview."""
    title = PRODUCT_TITLES.get(kind, "Weather Product")
    day = _issue_day(values.get("issuedAt", ""), recorded_at)
    hour = f"{ISSUE_HOURS[kind]:02}00" if kind in ISSUE_HOURS else ""
    return pdf_filename(
        f"GMS {title} {day} {hour}".strip(),
        note=f"rev {revision}" if revision is not None else "draft preview",
    )
