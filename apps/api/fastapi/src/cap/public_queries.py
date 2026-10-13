"""Read-only queries behind the public CAP feeds and warnings."""

from datetime import datetime, timedelta

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.common import _as_naive
from src.cap.exceptions import (
    CapAlertNotFoundError,
    CapSnapshotNotFoundError,
)
from src.cap.levels import read_level
from src.cap.mapping import (
    _alert_selectinload_options,
    _to_public,
    _to_public_from_loaded,
)
from src.cap.models import (
    CapAlert,
    CapInfo,
    CapLifecycleState,
    CapMessageType,
    CapReference,
    CapScope,
    CapSnapshot,
    CapStatus,
)
from src.cap.schemas import (
    CapAlertListPublic,
    CapAlertPublic,
    PublicWarnings,
)
from src.utils.datetime import utc_now


async def public_latest_active(*, session: AsyncSession) -> CapAlertListPublic:
    now = utc_now()
    active_info = (
        select(CapInfo.id)
        .where(
            CapInfo.alert_id == CapAlert.id,
            sa.or_(CapInfo.expires.is_(None), CapInfo.expires > now),
        )
        .exists()
    )
    result = await session.execute(
        select(CapAlert)
        .where(
            CapAlert.lifecycle_state == CapLifecycleState.PUBLISHED,
            CapAlert.scope == CapScope.PUBLIC,
            CapAlert.msg_type.in_({CapMessageType.ALERT, CapMessageType.UPDATE}),
            CapAlert.sent <= now,
            active_info,
        )
        .order_by(CapAlert.sent.desc())
        .limit(100)
        .options(*_alert_selectinload_options())
    )
    active = [_to_public_from_loaded(alert) for alert in result.scalars()]
    await _attach_public_replacements(session=session, alerts=active)
    return CapAlertListPublic(data=active, count=len(active))


async def public_recent_cancels(*, session: AsyncSession) -> list[CapAlertPublic]:
    """Public, actual Cancel messages retained for RSS polling for 24 hours."""
    now = utc_now()
    result = await session.execute(
        select(CapAlert)
        .where(
            CapAlert.lifecycle_state == CapLifecycleState.PUBLISHED,
            CapAlert.scope == CapScope.PUBLIC,
            CapAlert.status == CapStatus.ACTUAL,
            CapAlert.msg_type == CapMessageType.CANCEL,
            CapAlert.sent <= now,
            CapAlert.published_at >= now - timedelta(hours=24),
        )
        .order_by(CapAlert.published_at.desc())
        .limit(100)
        .options(*_alert_selectinload_options())
    )
    return [_to_public_from_loaded(alert) for alert in result.scalars()]


async def public_past_alerts(*, session: AsyncSession) -> CapAlertListPublic:
    now = utc_now()
    any_info = select(CapInfo.id).where(CapInfo.alert_id == CapAlert.id).exists()
    unexpired_info = (
        select(CapInfo.id)
        .where(
            CapInfo.alert_id == CapAlert.id,
            sa.or_(CapInfo.expires.is_(None), CapInfo.expires > now),
        )
        .exists()
    )
    result = await session.execute(
        select(CapAlert)
        .where(
            CapAlert.scope == CapScope.PUBLIC,
            sa.or_(
                CapAlert.lifecycle_state.in_(
                    {CapLifecycleState.EXPIRED, CapLifecycleState.CANCELLED}
                ),
                sa.and_(
                    CapAlert.lifecycle_state == CapLifecycleState.PUBLISHED,
                    CapAlert.msg_type.in_(
                        {CapMessageType.ALERT, CapMessageType.UPDATE}
                    ),
                    any_info,
                    ~unexpired_info,
                ),
            ),
        )
        .order_by(CapAlert.sent.desc())
        .limit(100)
        .options(*_alert_selectinload_options())
    )
    past = [_to_public_from_loaded(alert) for alert in result.scalars()]
    await _attach_public_replacements(session=session, alerts=past)
    return CapAlertListPublic(data=past, count=len(past))


async def public_all_alerts(*, session: AsyncSession) -> CapAlertListPublic:
    alerts = await _public_alerts_by_state(
        session=session,
        states={
            CapLifecycleState.PUBLISHED,
            CapLifecycleState.EXPIRED,
            CapLifecycleState.CANCELLED,
        },
    )
    return CapAlertListPublic(data=alerts, count=len(alerts))


async def public_alert_by_identifier(
    *, session: AsyncSession, identifier: str
) -> CapAlertPublic:
    result = await session.execute(
        select(CapAlert)
        .where(CapAlert.identifier == identifier)
        .where(
            CapAlert.lifecycle_state.in_(
                {
                    CapLifecycleState.PUBLISHED,
                    CapLifecycleState.EXPIRED,
                    CapLifecycleState.CANCELLED,
                }
            )
        )
        # Public-scope only — Restricted/Private alerts are not anonymously readable.
        .where(CapAlert.scope == CapScope.PUBLIC)
    )
    alert = result.scalars().first()
    if not alert:
        raise CapAlertNotFoundError()
    public = await _to_public(session=session, alert=alert)
    await _attach_public_replacements(session=session, alerts=[public])
    return public


async def latest_snapshot_for_identifier(
    *, session: AsyncSession, identifier: str
) -> CapSnapshot:
    result = await session.execute(
        select(CapSnapshot)
        # Gate the raw signed-XML snapshot on the parent alert's scope so
        # Restricted/Private alerts are not served on the anonymous endpoint.
        .join(CapAlert, CapSnapshot.alert_id == CapAlert.id)
        .where(CapSnapshot.identifier == identifier)
        .where(CapAlert.scope == CapScope.PUBLIC)
        .order_by(CapSnapshot.generated_at.desc())
    )
    snapshot = result.scalars().first()
    if not snapshot:
        raise CapSnapshotNotFoundError()
    return snapshot


async def _public_alerts_by_state(
    *, session: AsyncSession, states: set[CapLifecycleState]
) -> list[CapAlertPublic]:
    stmt = (
        select(CapAlert)
        .where(CapAlert.lifecycle_state.in_(states))
        # Only Public-scope alerts are distributable on the anonymous feeds.
        # Restricted/Private alerts must never surface here (they carry
        # restriction/addresses targeting fields).
        .where(CapAlert.scope == CapScope.PUBLIC)
        .order_by(CapAlert.sent.desc())
        .limit(100)
        .options(*_alert_selectinload_options())
    )
    result = await session.execute(stmt)
    alerts = [_to_public_from_loaded(alert) for alert in result.scalars()]
    await _attach_public_replacements(session=session, alerts=alerts)
    return alerts


async def _attach_public_replacements(
    *, session: AsyncSession, alerts: list[CapAlertPublic]
) -> None:
    if not alerts:
        return
    result = await session.execute(
        select(
            CapReference.sender,
            CapReference.identifier,
            CapReference.sent,
            CapAlert.identifier,
            CapAlert.msg_type,
            CapAlert.note,
        )
        .join(CapAlert, CapReference.alert_id == CapAlert.id)
        .where(
            CapReference.identifier.in_([alert.identifier for alert in alerts]),
            CapAlert.msg_type.in_({CapMessageType.UPDATE, CapMessageType.CANCEL}),
            CapAlert.lifecycle_state.in_(
                {
                    CapLifecycleState.PUBLISHED,
                    CapLifecycleState.EXPIRED,
                    CapLifecycleState.CANCELLED,
                }
            ),
            CapAlert.scope == CapScope.PUBLIC,
        )
        .order_by(CapAlert.sent.desc())
    )
    replacements: dict[tuple[str, str, datetime], str] = {}
    cancellations: dict[tuple[str, str, datetime], str] = {}
    for sender, identifier, sent, successor_identifier, msg_type, note in result.all():
        key = (sender, identifier, sent)
        if msg_type == CapMessageType.UPDATE:
            replacements.setdefault(key, successor_identifier)
        elif note:
            cancellations.setdefault(key, note)
    for alert in alerts:
        key = (alert.sender, alert.identifier, _as_naive(alert.sent))
        alert.replaced_by_identifier = replacements.get(key)
        alert.cancellation_reason = cancellations.get(key)


# Existing public-site display groups, not authoritative CAP event codes.
PUBLIC_HAZARD_GROUPS = (
    ("Tropical Cyclone", r"cyclone|hurricane|tropical storm|depression"),
    ("Marine / Small Craft", r"marine|small craft|sea|swell|surf|wave"),
    ("Flood / Heavy Rain", r"flood|rain|flash"),
    ("Thunderstorm", r"thunder|lightning|storm(?! surge)"),
    ("Wind", r"wind|gale|gust"),
    ("Heat", r"heat|high temperature"),
    ("Dust / Haze", r"dust|haze|saharan|smoke"),
    ("Coastal Hazard", r"coastal|storm surge|rip current|inundation"),
    ("Tsunami", r"tsunami|seismic sea wave"),
)


def select_public_warnings(
    alerts: list[CapAlertPublic], now: datetime
) -> PublicWarnings:
    import re

    from src.cap.schemas import PublicWarning, PublicWarningGroup

    if now.tzinfo is None:
        raise ValueError("An aware selection clock is required")
    instant = _as_naive(now)
    groups = [
        PublicWarningGroup(name=name, alerts=[]) for name, _ in PUBLIC_HAZARD_GROUPS
    ]
    other = PublicWarningGroup(name="Other warnings", alerts=[])
    order = {"Extreme": 0, "Severe": 1, "Moderate": 2, "Minor": 3, "Unknown": 4}
    for alert in alerts:
        if (
            alert.scope != CapScope.PUBLIC
            or alert.lifecycle_state != CapLifecycleState.PUBLISHED
            or alert.msg_type not in {CapMessageType.ALERT, CapMessageType.UPDATE}
            or _as_naive(alert.sent) > instant
        ):
            continue
        candidates = [
            info
            for info in alert.info
            if (info.effective is None or _as_naive(info.effective) <= instant)
            and (info.expires is None or _as_naive(info.expires) > instant)
        ]
        if not candidates:
            continue
        info = min(
            candidates,
            key=lambda item: (
                not item.language.lower().startswith("en"),
                item.sequence,
                str(item.id),
            ),
        )
        product, colour = read_level(info.parameters)
        warning = PublicWarning(
            identifier=alert.identifier,
            event=info.event,
            headline=info.headline,
            areas=[area.area_desc for area in info.areas],
            expires=info.expires,
            severity=info.severity,
            status=alert.status,
            product=product.value if product else None,
            colour=colour.value if colour else None,
        )
        group = next(
            (
                groups[index]
                for index, (_, pattern) in enumerate(PUBLIC_HAZARD_GROUPS)
                if re.search(pattern, info.event, re.IGNORECASE)
            ),
            other,
        )
        group.alerts.append(warning)
    if other.alerts:
        groups.append(other)
    for group in groups:
        group.alerts.sort(
            key=lambda item: (order[item.severity.value], item.identifier)
        )
    return PublicWarnings(
        as_of=now,
        groups=groups,
        activeCount=sum(
            alert.status == CapStatus.ACTUAL
            for group in groups
            for alert in group.alerts
        ),
    )


async def public_warnings(*, session: AsyncSession) -> PublicWarnings:
    from datetime import UTC

    statement = (
        select(CapAlert)
        .where(
            CapAlert.lifecycle_state == CapLifecycleState.PUBLISHED,
            CapAlert.scope == CapScope.PUBLIC,
        )
        .options(*_alert_selectinload_options())
    )
    rows = (await session.execute(statement)).scalars().all()
    return select_public_warnings(
        [_to_public_from_loaded(row) for row in rows], datetime.now(UTC)
    )
