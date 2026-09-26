"""Summary of CAP alerts and GMS bulletins in force, captured into forecasts.

A forecast is a summary document: CAP alerts and hazard bulletins remain the
authoritative warnings. When a forecast is saved or previewed, the alerts and
bulletins in force are copied into its revision so the issued PDF records what
applied at the time, without a live join. The snapshot is JSON in the
`advisories` value (all product values are strings).
"""

import json
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import service as cap_service

from . import service
from .schemas import values_as_dict

logger = logging.getLogger(__name__)

BULLETIN_TITLES = {
    "cyclone": "Tropical cyclone",
    "marine": "Marine",
    "flood": "Flood",
    "thunderstorm": "Thunderstorm",
    "wind": "Wind",
    "heat": "Heat",
    "dust": "Dust haze",
    "coastal": "Coastal hazard",
    "tsunami": "Tsunami",
}
# Colour names follow CAP `awareness_level`; bulletins say "Amber".
COLOURS = {"green", "yellow", "orange", "red"}
COLOUR_RANK = {"red": 0, "orange": 1, "yellow": 2, "green": 3, "": 4}
# CAP certainty/severity mapped onto the IBF matrix axes. The colour a source
# declares is authoritative; the mapping only positions the matrix mark.
LIKELIHOOD_FROM_CERTAINTY = {
    "Observed": "High",
    "Likely": "Medium",
    "Possible": "Low",
    "Unlikely": "Very low",
}
IMPACT_FROM_SEVERITY = {
    "Minor": "Minor",
    "Moderate": "Significant",
    "Severe": "Severe",
    "Extreme": "Severe",
}
TEXT_LIMIT = 400
ITEM_LIMIT = 8


def _clip(text: str | None) -> str:
    value = " ".join((text or "").split())
    return value if len(value) <= TEXT_LIMIT else f"{value[: TEXT_LIMIT - 1]}…"


def _iso(value: datetime | None) -> str:
    return value.astimezone(UTC).isoformat() if value else ""


def _colour(value: str) -> str:
    colour = value.strip().lower().replace("amber", "orange")
    return colour if colour in COLOURS else ""


def _parameter(parameters: list[Any], name: str) -> str:
    for parameter in parameters:
        if parameter.value_name == name:
            return str(parameter.value)
    return ""


async def _cap_items(session: AsyncSession) -> list[dict[str, str]]:
    alerts = await cap_service.public_latest_active(session=session)
    items = []
    for alert in alerts.data:
        info = next(
            (i for i in alert.info if i.language.lower().startswith("en")),
            alert.info[0] if alert.info else None,
        )
        if info is None:
            continue
        awareness = _parameter(info.parameters, "awareness_level").split(";")
        product = _parameter(info.parameters, "GMS:product") or "Alert"
        items.append(
            {
                "source": "CAP",
                "title": info.event,
                "product": product,
                "colour": _colour(awareness[1]) if len(awareness) > 1 else "",
                "likelihood": LIKELIHOOD_FROM_CERTAINTY.get(info.certainty, ""),
                "impact": IMPACT_FROM_SEVERITY.get(info.severity, ""),
                "impacts": _clip(info.description),
                "response": _clip(info.instruction),
                "validFrom": _iso(info.onset or info.effective or alert.sent),
                "validTo": _iso(info.expires),
                "reference": f"CAP {alert.identifier}",
            }
        )
    return items


async def _bulletin_items(session: AsyncSession) -> list[dict[str, str]]:
    items = []
    for product in await service.list_published_products(session, None):
        if product.kind not in BULLETIN_TITLES:
            continue
        values = values_as_dict(product.values)
        title = BULLETIN_TITLES[product.kind]
        items.append(
            {
                "source": "Bulletin",
                "title": title,
                "product": "Bulletin",
                "colour": _colour(values.get("level", "")),
                "likelihood": values.get("likelihood", ""),
                "impact": values.get("impact", ""),
                "impacts": _clip(values.get("impacts")),
                "response": _clip(values.get("response")),
                "validFrom": values.get("validFrom", ""),
                "validTo": values.get("validTo", ""),
                "reference": f"GMS {title} bulletin r{product.revision}",
            }
        )
    return items


async def snapshot(
    cap_session: AsyncSession | None, weather_session: AsyncSession | None
) -> str:
    """JSON summary; `complete` is false when a source could not be read."""
    items: list[dict[str, str]] = []
    complete = True
    for loader, session in (
        (_cap_items, cap_session),
        (_bulletin_items, weather_session),
    ):
        if session is None:
            complete = False
            continue
        try:
            items.extend(await loader(session))
        except SQLAlchemyError, OSError, TimeoutError:
            logger.warning("Advisory source unavailable for forecast snapshot")
            complete = False
        finally:
            # End the read's autobegun transaction; the caller may reuse the
            # session for `session.begin()` (write_product).
            if session.in_transaction():
                await session.rollback()
    items.sort(key=lambda item: COLOUR_RANK[item["colour"]])
    return json.dumps(
        {
            "capturedAt": datetime.now(UTC).isoformat(),
            "complete": complete,
            "items": items[:ITEM_LIMIT],
        },
        ensure_ascii=False,
    )


def parse(value: str) -> dict[str, Any]:
    try:
        data = json.loads(value) if value else {}
    except ValueError:
        return {"complete": False, "items": []}
    return data if isinstance(data, dict) else {"complete": False, "items": []}
