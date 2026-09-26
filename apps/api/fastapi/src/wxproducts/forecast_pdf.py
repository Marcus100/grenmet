"""Forecast and bulletin PDFs (GMS design system, A4).

One renderer serves the live draft preview and the issued revision, so what a
forecaster reviews is what is published. The layout is HTML/CSS
(`templates/forecast.html.j2`, `templates/forecast.css`) rendered by
WeasyPrint; this module prepares the data and the design tokens.
"""

import re
from datetime import date, datetime
from functools import cache
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup
from weasyprint import CSS, HTML, Document  # type: ignore[import-untyped]
from weasyprint.text.fonts import FontConfiguration  # type: ignore[import-untyped]

from . import advisories, units
from .presentation import conditions as _conditions
from .validation import FIELDS, GRENADA, optional_number, period_values

BASE = Path(__file__).parent
ASSETS = BASE / "assets"
TEMPLATES = BASE / "templates"

# Mirrors of the `--gm-*` tokens in packages/gms/src/styles/foundation.css
# (tests/wxproducts/test_forecast_pdf.py fails if they drift).
PALETTE = {
    "navy": "#0b132b",
    "sky-ink": "#0f70b5",
    "blue-ink": "#0b63ee",
    "lime": "#b9ee63",
    "surface": "#f3f8fc",
    "border": "#d0d5dd",
    "text-primary": "#111827",
    "text-secondary": "#4b5563",
    "text-muted": "#6b7280",
    "risk-green": "#00843d",
    "risk-yellow": "#ffe923",
    "risk-amber": "#ff9900",
    "risk-red": "#cc0033",
    "risk-grey": "#dcdcdc",
}

# Warning fills and their contrast-safe ink (`--gm-warning-*-bg/-fg`).
WARNING_TOKENS = {
    "green": ("risk-green", "#ffffff"),
    "yellow": ("risk-yellow", PALETTE["text-primary"]),
    "amber": ("risk-amber", PALETTE["text-primary"]),
    "red": ("risk-red", "#ffffff"),
    "grey": ("risk-grey", PALETTE["text-primary"]),
}
COLOUR_NAMES = {"green": "Green", "yellow": "Yellow", "orange": "Amber", "red": "Red"}

LIKELIHOODS = ["Very low", "Low", "Medium", "High"]

IMPACTS = ["Minimal", "Minor", "Significant", "Severe"]

# Standard IBF risk matrix, rows from "Very low" to "High" likelihood.
MATRIX = [
    ["green", "green", "yellow", "yellow"],
    ["green", "green", "yellow", "orange"],
    ["green", "yellow", "orange", "orange"],
    ["green", "yellow", "orange", "red"],
]

TITLES = {
    "morning": "Morning Forecast",
    "midday": "Midday Forecast",
    "evening": "Evening Forecast",
}

PERIODS = {
    "morning": "Today and tonight",
    "midday": "This afternoon and tonight",
    "evening": "Tonight",
}

PRODUCT_CODES = {
    "morning": "GMS-PWF-MORNING",
    "midday": "GMS-PWF-MIDDAY",
    "evening": "GMS-PWF-EVENING",
}

NEXT_ISSUE = {"morning": "12:00", "midday": "18:00", "evening": "07:00"}

CONDITION_ICONS = {
    "Sunny": "sun",
    "Sunny intervals": "cloud-sun",
    "Cloudy": "cloud",
    "Showers": "cloud-rain",
}

# Contact block from the GMS forecast sheet design (GrenMet v1).
CONTACT = {
    "Phone": "1 473 444 4142",
    "Email": "contact@weather.gd",
    "Website": "weather.gd",
}


@cache
def _icon_svg(name: str) -> str:
    return (ASSETS / "icons" / f"{name}.svg").read_text()


def _local(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def _when(value: str, *, with_date: bool = True) -> str:
    parsed = _local(value)
    if parsed is None:
        return value or "—"
    return parsed.strftime("%H:%M, %a %-d %b %Y" if with_date else "%H:%M")


def _span_text(start: str, end: str) -> str:
    a, b = _local(start), _local(end)
    if not (a and b):
        return "—"
    return f"{a:%H:%M %a %-d %b} to {b:%H:%M %a %-d %b}"


def _advisory_valid(item: dict[str, str]) -> str:
    def fmt(value: str) -> str:
        parsed = _local(value.replace("Z", "+00:00")) if value else None
        if parsed is None:
            return ""
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(GRENADA)
        return f"{parsed:%H:%M %a %-d %b}"

    start, end = fmt(item.get("validFrom", "")), fmt(item.get("validTo", ""))
    if start and end:
        return f"{start} to {end}"
    return start or end or "Until further notice"


def _day_label(value: str) -> str:
    try:
        return f"{date.fromisoformat(value):%a %-d %b}"
    except ValueError:
        return value or "—"


def token_css() -> str:
    """`--gm-*` custom properties for the sheet, from the mirrored tokens."""
    props = {f"--gm-{name}": value for name, value in PALETTE.items()}
    props["--gm-surface-page"] = "#ffffff"
    props["--gm-text-inverse"] = "#ffffff"
    for level, (fill, ink) in WARNING_TOKENS.items():
        props[f"--gm-warning-{level}-bg"] = PALETTE[fill]
        props[f"--gm-warning-{level}-fg"] = ink
    return ":root {" + "".join(f"{k}: {v};" for k, v in props.items()) + "}"


# WeasyPrint does not resolve an SVG's `currentColor` from CSS, so icons get
# their stroke colour here: a mirrored token name, or a warning colour's ink.
def icon(name: str, css_class: str, tone: str = "navy") -> Markup:
    if tone in WARNING_TOKENS:
        colour = WARNING_TOKENS[tone][1]
    else:
        colour = PALETTE.get(tone, PALETTE["navy"])
    svg = _icon_svg(name).replace("currentColor", colour)
    svg = svg.replace("<svg ", f'<svg class="{css_class}" ', 1)
    return Markup(svg)  # noqa: S704 - vendored lucide SVG files, not user input


def tone_for(colour: str | None) -> str:
    """Warning-token key for a risk colour (`orange` is the amber token)."""
    return {"orange": "amber"}.get(colour or "", colour or "grey")


@cache
def _environment() -> Environment:
    env = Environment(
        loader=FileSystemLoader(TEMPLATES),
        autoescape=select_autoescape(["html", "j2"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.globals["icon"] = icon
    env.globals["tone_for"] = tone_for
    return env


@cache
def _fonts() -> FontConfiguration:
    return FontConfiguration()


@cache
def _stylesheet() -> CSS:
    return CSS(
        string=token_css() + (TEMPLATES / "sheet.css").read_text(),
        base_url=str(BASE) + "/",
        font_config=_fonts(),
    )


def _matrix(items: list[dict[str, str]]) -> list[list[dict[str, Any]]]:
    rows = []
    for likelihood_index in reversed(range(4)):
        row = []
        for impact_index, colour in enumerate(MATRIX[likelihood_index]):
            marks = [
                number
                for number, item in enumerate(items, start=1)
                if item.get("likelihood") == LIKELIHOODS[likelihood_index]
                and item.get("impact") == IMPACTS[impact_index]
            ]
            row.append({"colour": colour, "marks": marks})
        rows.append(row)
    return rows


# Day cards keep to the essentials; tides and sun times stay on the full report.
DAY_CARD_ICONS = {
    "thermometer-sun",
    "thermometer-snowflake",
    "wind",
    "compass",
    "waves",
}


def _outlook(values: dict[str, str]) -> list[dict[str, Any]]:
    days = []
    for day in range(1, 5):
        p = period_values(values, f"day{day}")
        days.append(
            {
                "label": _day_label(p.get("date", "")),
                "weather": p.get("weather", "") or "—",
                "tiles": [
                    {"icon": i, "value": v, "label": label}
                    for i, v, label in _conditions(values, f"day{day}")
                    if i in DAY_CARD_ICONS
                ],
            }
        )
    return days


def forecast_context(
    kind: str, values: dict[str, str], *, status: str, revision: str
) -> dict[str, Any]:
    snapshot = advisories.parse(values.get("advisories", ""))
    items = [
        item | {"valid": _advisory_valid(item)}
        for item in snapshot.get("items", [])
        if isinstance(item, dict)
    ]
    return {
        "title": TITLES[kind],
        "issued": _when(values.get("issuedAt", "")),
        "valid": _span_text(values.get("validFrom", ""), values.get("validTo", "")),
        "status": "" if status == "PUBLISHED ISSUE" else status,
        "revision": revision,
        "period": PERIODS[kind],
        "summary": values.get("summary", ""),
        "condition_icon": CONDITION_ICONS.get(values.get("condition", ""), "cloud-sun"),
        "tiles": [
            {"icon": i, "value": v, "label": label}
            for i, v, label in _conditions(values)
        ],
        "matrix": _matrix(items),
        "advisories": items,
        "complete": bool(snapshot.get("complete", True)),
        "colour_names": COLOUR_NAMES,
        "outlook": _outlook(values) if kind == "evening" else [],
        "word": values.get("word", "") if values.get("definition") else "",
        "definition": values.get("definition", ""),
        "forecaster": values.get("forecaster", ""),
        "product_code": PRODUCT_CODES[kind],
        "next_update": f"{NEXT_ISSUE[kind]} AST",
        "contact": CONTACT,
    }


def render_forecast_document(
    kind: str, values: dict[str, str], *, status: str, revision: str
) -> Document:
    return render_document(kind, values, status=status, revision=revision)


def render_forecast_pdf(
    kind: str, values: dict[str, str], *, status: str, revision: str
) -> bytes:
    return render_sheet_pdf(kind, values, status=status, revision=revision)


BULLETIN_NAMES = {
    "cyclone": "Tropical Cyclone",
    "marine": "Marine / Small Craft",
    "flood": "Flood / Heavy Rain",
    "thunderstorm": "Thunderstorm",
    "wind": "Wind",
    "heat": "Heat",
    "dust": "Dust / Haze",
    "coastal": "Coastal Hazard",
    "tsunami": "Tsunami",
}
HAZARD_ICONS = {
    "cyclone": "tornado",
    "marine": "waves",
    "flood": "droplets",
    "thunderstorm": "cloud-lightning",
    "wind": "wind",
    "heat": "thermometer-sun",
    "dust": "haze",
    "coastal": "waves",
    "tsunami": "waves",
}
LEVEL_COLOURS = {"Green": "green", "Yellow": "yellow", "Amber": "orange", "Red": "red"}
# Shown in the banner, headline, tiles or assessment rather than as details.
BULLETIN_CORE = {
    "issuedAt",
    "validFrom",
    "validTo",
    "validity",
    "area",
    "forecaster",
    "bulletinNumber",
    "level",
    "notice",
    "synopsis",
    "likelihood",
    "impact",
    "impacts",
    "response",
    "nextUpdate",
    "visibility",
    "maxTemperature",
    "minTemperature",
    "sunrise",
    "sunset",
    "wind",
    "seaState",
    "highTides",
    "lowTides",
}
STRUCTURED_KEY = re.compile(
    r"^(visibility(Min|Max)|windDir(From|To)|windSpeed(Min|Max)|windGust|seaState(From|To)"
    r"|waveHeight(Min|Max)|swell(Dir|Period|Height)|tide[1-4](Type|Time|Height))$"
)


def _bulletin_details(kind: str, values: dict[str, str]) -> list[tuple[str, str]]:
    has_structured_swell = any(values.get(k) for k in ("swellDir", "swellHeight"))
    details = []
    for rule in FIELDS[kind]:
        value = values.get(rule.key, "").strip()
        if not value or rule.key in BULLETIN_CORE or STRUCTURED_KEY.match(rule.key):
            continue
        if rule.key == "swell" and has_structured_swell:
            continue
        details.append((rule.label, value))
    return details


def bulletin_context(
    kind: str, values: dict[str, str], *, status: str, revision: str
) -> dict[str, Any]:
    level = values.get("level", "")
    name = BULLETIN_NAMES[kind]
    tiles = [
        {"icon": i, "value": v, "label": label} for i, v, label in _conditions(values)
    ]
    if values.get("visibility"):
        tiles.append(
            {"icon": "eye", "value": values["visibility"], "label": "Visibility"}
        )
    items = [{"likelihood": values.get("likelihood"), "impact": values.get("impact")}]
    number = values.get("bulletinNumber", "")
    return {
        "title": f"{name} Bulletin",
        "subtitle": f"Bulletin No. {number}" if number else "",
        "issued": _when(values.get("issuedAt", "")),
        "valid": _span_text(values.get("validFrom", ""), values.get("validTo", "")),
        "status": "" if status == "PUBLISHED ISSUE" else status,
        "revision": revision,
        "level_colour": LEVEL_COLOURS.get(level, ""),
        "level_title": f"{level} level" if level else "Level not set",
        "notice": values.get("notice", ""),
        "area": values.get("area", ""),
        "hazard_name": name,
        "hazard_icon": HAZARD_ICONS[kind],
        "synopsis": values.get("synopsis", ""),
        "tiles": tiles,
        "details": _bulletin_details(kind, values),
        "matrix": _matrix([{k: v or "" for k, v in item.items()} for item in items]),
        "likelihood": values.get("likelihood", ""),
        "impact": values.get("impact", ""),
        "impacts": values.get("impacts", ""),
        "response": values.get("response", ""),
        "forecaster": values.get("forecaster", ""),
        "product_code": f"GMS-BUL-{kind.upper()}",
        "next_update": _when(values["nextUpdate"]) if values.get("nextUpdate") else "",
        "contact": CONTACT,
    }


def formation_category(percent: float) -> tuple[str, str]:
    """NHC formation categories: low < 40 %, medium 40–60 %, high > 60 %."""
    if percent > 60:
        return "High", "red"
    if percent >= 40:
        return "Medium", "orange"
    return "Low", "yellow"


def _formation_chances(values: dict[str, str]) -> list[dict[str, str]]:
    chances = []
    for key, window in (
        ("formationChance48h", "48 hours"),
        ("formationChance7d", "7 days"),
    ):
        percent = optional_number(values, key)
        if percent is None:
            continue
        category, colour = formation_category(percent)
        chances.append(
            {
                "window": window,
                "percent": f"{units._num(percent)}%",
                "category": category,
                "colour": colour,
            }
        )
    return chances


def outlook_context(
    values: dict[str, str], *, status: str, revision: str
) -> dict[str, Any]:
    return {
        "title": "Tropical Weather Outlook",
        "subtitle": "",
        "issued": _when(values.get("issuedAt", "")),
        "valid": _span_text(values.get("validFrom", ""), values.get("validTo", "")),
        "status": "" if status == "PUBLISHED ISSUE" else status,
        "revision": revision,
        "special_interest": values.get("specialInterest", ""),
        "systems": values.get("systems", ""),
        "formation": values.get("formation", ""),
        "chances": _formation_chances(values),
        "area": values.get("area", ""),
        "source": values.get("source", ""),
        "forecaster": values.get("forecaster", ""),
        "product_code": "GMS-TWO",
        "next_update": _when(values["nextUpdate"]) if values.get("nextUpdate") else "",
        "contact": CONTACT,
    }


def render_document(
    kind: str, values: dict[str, str], *, status: str, revision: str
) -> Document:
    """Forecast, bulletin or outlook sheet."""
    if kind == "outlook":
        template, context = (
            "outlook.html.j2",
            outlook_context(values, status=status, revision=revision),
        )
    elif kind in BULLETIN_NAMES:
        template, context = (
            "bulletin.html.j2",
            bulletin_context(kind, values, status=status, revision=revision),
        )
    else:
        template, context = (
            "forecast.html.j2",
            forecast_context(kind, values, status=status, revision=revision),
        )
    html = _environment().get_template(template).render(**context)
    return HTML(string=html, base_url=str(BASE) + "/").render(
        stylesheets=[_stylesheet()], font_config=_fonts()
    )


def render_sheet_pdf(
    kind: str,
    values: dict[str, str],
    *,
    status: str,
    revision: str,
    archival: bool = False,
) -> bytes:
    """Render a sheet; saved revisions are official records, so they are PDF/A-3b."""
    document = render_document(kind, values, status=status, revision=revision)
    pdf = document.write_pdf(pdf_variant="pdf/a-3b" if archival else None)
    if not isinstance(pdf, bytes):
        raise TypeError("WeasyPrint returned no PDF bytes")
    return pdf


SHEET_KINDS = frozenset(TITLES) | frozenset(BULLETIN_NAMES) | {"outlook"}
