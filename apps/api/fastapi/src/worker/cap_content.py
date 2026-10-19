"""Plain-language view of a published CAP alert, shared by the email and push channels."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import (
    CapAlert,
    CapArea,
    CapInfo,
    CapMessageType,
    CapReference,
)
from src.config import settings
from src.subscriptions.constants import CAP_ALERTS_LIST_KEY
from src.subscriptions.service import site_url
from src.utils.timezones import GRENADA

_GRENADA = GRENADA

_LABELS = {
    CapMessageType.ALERT: "Weather alert",
    CapMessageType.UPDATE: "Updated weather alert",
    CapMessageType.CANCEL: "Weather alert cancelled",
}


@dataclass(frozen=True)
class AlertContent:
    identifier: str
    msg_type: str
    label: str
    headline: str
    event: str
    severity: str
    urgency: str
    certainty: str
    areas: str
    effective: str | None
    expires: str | None
    instruction: str | None
    alert_link: str
    cap_link: str


def format_time(value: datetime | None) -> str | None:
    """Naive-UTC database time as Grenada local time."""
    if value is None:
        return None
    local = value.replace(tzinfo=ZoneInfo("UTC")).astimezone(_GRENADA)
    return local.strftime("%-d %b %Y, %H:%M AST")


def alert_link(identifier: str) -> str:
    return f"{site_url(CAP_ALERTS_LIST_KEY)}/alerts/{quote(identifier, safe='')}"


def cap_link(identifier: str) -> str:
    base = str(settings.API_BASE_URL or "").rstrip("/")
    return f"{base}/api/cap/{quote(identifier, safe='')}.xml"


async def _info_for(session: AsyncSession, alert_id: uuid.UUID) -> CapInfo | None:
    return (
        await session.scalars(
            select(CapInfo)
            .where(CapInfo.alert_id == alert_id)
            .order_by(CapInfo.sequence)
        )
    ).first()


async def load_content(
    *, session: AsyncSession, alert: CapAlert
) -> AlertContent | None:
    """Content for an alert; a Cancel borrows the text of the alert it cancels."""
    info = await _info_for(session, alert.id)
    if info is None:
        reference = (
            await session.scalars(
                select(CapReference)
                .where(CapReference.alert_id == alert.id)
                .order_by(CapReference.sequence)
            )
        ).first()
        referenced = (
            await session.scalar(
                select(CapAlert).where(CapAlert.identifier == reference.identifier)
            )
            if reference
            else None
        )
        info = await _info_for(session, referenced.id) if referenced else None
    if info is None:
        return None
    areas = (
        await session.scalars(
            select(CapArea).where(CapArea.info_id == info.id).order_by(CapArea.sequence)
        )
    ).all()
    cancelled = alert.msg_type == CapMessageType.CANCEL
    return AlertContent(
        identifier=alert.identifier,
        msg_type=alert.msg_type.value,
        label=_LABELS.get(alert.msg_type, "Weather alert"),
        headline=info.headline,
        event=info.event,
        severity=info.severity.value,
        urgency=info.urgency.value,
        certainty=info.certainty.value,
        areas="; ".join(area.area_desc for area in areas),
        effective=None if cancelled else format_time(info.effective or alert.sent),
        expires=None if cancelled else format_time(info.expires),
        instruction=(alert.note if cancelled else info.instruction),
        alert_link=alert_link(alert.identifier),
        cap_link=cap_link(alert.identifier),
    )
