"""Time-based GMS notifications, swept every five minutes by the ARQ worker.

Each sweep reads its source (the main database, or the weather products, eRegister
or NHC archive database), decides who is owed a notification, and calls
``gms.tell`` with a ``dedupe_key`` built from the item, so running a sweep twice,
or the cron firing again after a restart, never notifies twice for the same item.
Sweeps whose database is not configured are skipped. Notifications carry a
summary and a link only: no error text, medical or personal detail.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import (
    CapAlert,
    CapInfo,
    CapLifecycleState,
    CapMessageType,
    CapStatus,
)
from src.eregister.gate import SOURCE_MANUAL, official_source
from src.eregister.models import ERegisterSend
from src.utils.timezones import GRENADA
from src.worker.config import worker_settings

from . import gms

logger = logging.getLogger(__name__)

# Forecasts due at these local hours; mirrors wxproducts.validation.ISSUE_HOURS.
FORECAST_GRACE = timedelta(minutes=15)
FORECAST_GIVE_UP = timedelta(hours=6)
WARNING_LEAD = timedelta(hours=1)
OBSERVATION_GRACE = timedelta(minutes=15)
LOOKBACK = timedelta(hours=24)
QUERY_LOOKBACK = timedelta(hours=48)
NHC_LOOKBACK = timedelta(hours=1)
MAX_ROWS = 50


def _utc(now: datetime | None) -> datetime:
    return (now or datetime.now(UTC)).astimezone(UTC)


def _naive(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(tzinfo=None)


def _hour_text(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%d %b %H:%M UTC")


# ── 1. Forecast overdue ──────────────────────────────────────────────────────


async def forecast_overdue(
    session: AsyncSession, weather: AsyncSession, now: datetime | None = None
) -> int:
    """Tell the duty forecasters when a scheduled forecast is 15 minutes late."""
    from src.wxproducts.validation import ISSUE_HOURS

    moment = _utc(now)
    local = moment.astimezone(GRENADA)
    day = local.date().isoformat()
    told = 0
    for kind, hour in ISSUE_HOURS.items():
        scheduled = datetime.combine(local.date(), time(hour), tzinfo=GRENADA)
        late_from = scheduled + FORECAST_GRACE
        if not late_from <= local < scheduled + FORECAST_GIVE_UP:
            continue
        issued = await weather.scalar(
            text(
                "SELECT 1 FROM authored_products WHERE kind = :kind"
                " AND published IS NOT NULL"
                " AND left(published -> 'values' ->> 'issuedAt', 10) = :day LIMIT 1"
            ),
            {"kind": kind, "day": day},
        )
        if issued:
            continue
        told += await gms.tell(
            session,
            gms.FORECAST_OVERDUE,
            await gms.duty_forecasters(session, kind, now=moment),
            {"product": kind.capitalize(), "due": f"{hour:02}:00"},
            link_path="/wxproducts/fcsts",
            entity_type="forecast",
            entity_id=f"{kind}:{day}",
            dedupe_key=f"{gms.FORECAST_OVERDUE}:{kind}:{day}",
        )
    return told


# ── 4. Warning expiring without an update ───────────────────────────────────


async def warning_expiring(session: AsyncSession, now: datetime | None = None) -> int:
    """One hour before a published warning expires, if nothing replaced it."""
    from src.cap.notifications import headline

    moment = _naive(_utc(now))
    expiry = func.max(CapInfo.expires)
    rows = (
        await session.execute(
            select(CapAlert, expiry)
            .join(CapInfo, CapInfo.alert_id == CapAlert.id)
            .where(
                CapAlert.lifecycle_state == CapLifecycleState.PUBLISHED,
                CapAlert.status == CapStatus.ACTUAL,
                CapAlert.msg_type.in_((CapMessageType.ALERT, CapMessageType.UPDATE)),
            )
            .group_by(CapAlert.id)
            .having(expiry > moment, expiry <= moment + WARNING_LEAD)
            .order_by(expiry)
            .limit(MAX_ROWS)
        )
    ).all()
    if not rows:
        return 0
    recipients = await gms.duty_or_holders(
        session, gms.CAP_DUTY_PERMISSIONS, now=_utc(now)
    )
    told = 0
    for alert, expires in rows:
        told += await gms.tell(
            session,
            gms.WARNING_EXPIRING,
            recipients | {alert.created_by_user_id},
            {
                "headline": await headline(session, alert),
                "identifier": alert.identifier,
                "expires": expires.replace(tzinfo=UTC)
                .astimezone(GRENADA)
                .strftime("%H:%M"),
            },
            link_path=gms.alert_link(alert.identifier),
            entity_type="cap_alert",
            entity_id=str(alert.id),
            dedupe_key=f"{gms.WARNING_EXPIRING}:{alert.id}",
        )
    return told


# ── 5. Hourly observation missing ───────────────────────────────────────────


async def observation_missing(
    session: AsyncSession, register: AsyncSession, now: datetime | None = None
) -> int:
    """Fifteen minutes after the hour, tell the observer on duty nothing was recorded."""
    moment = _utc(now)
    hour = (moment - OBSERVATION_GRACE).replace(minute=0, second=0, microsecond=0)
    stations = (
        (
            await register.execute(
                text(
                    "SELECT station_id, schedule, manual_hours_utc"
                    " FROM observations.stations ORDER BY 1"
                )
            )
        )
        .mappings()
        .all()
    )
    missing: list[str] = []
    for row in stations:
        station = row["station_id"]
        # Only hours a person must record; automatic hours arrive by themselves.
        if (
            official_source(row["schedule"], list(row["manual_hours_utc"]), hour)
            != SOURCE_MANUAL
        ):
            continue
        recorded = await register.scalar(
            text(
                "SELECT 1 FROM register_observations WHERE station_id = :station"
                " AND kind = 'SYNOP' AND observed_at >= :hour"
                " AND observed_at < :next AND state::text NOT IN ('rejected', 'superseded')"
                " LIMIT 1"
            ),
            {"station": station, "hour": hour, "next": hour + timedelta(hours=1)},
        )
        if not recorded:
            missing.append(station)
    if not missing:
        return 0
    # The observer on duty; with no roster, or nobody on shift, all register
    # staff who may record observations.
    observers = await gms.duty_or_holders(session, gms.OBSERVER_PERMISSIONS, now=moment)
    told = 0
    for station in missing:
        told += await gms.tell(
            session,
            gms.OBSERVATION_MISSING,
            observers,
            {"station": station, "hour": _hour_text(hour)},
            link_path="/wxproducts/hourly",
            entity_type="register_hour",
            entity_id=f"{station}:{hour.isoformat()}",
            dedupe_key=f"{gms.OBSERVATION_MISSING}:{station}:{hour.isoformat()}",
        )
    return told


# ── 2. Register record awaiting an optional review ──────────────────────────


async def register_review_requested(
    session: AsyncSession, register: AsyncSession, now: datetime | None = None
) -> int:
    """Accepted records nobody has reviewed yet: register staff other than the observer."""
    moment = _utc(now)
    rows = (
        (
            await register.execute(
                text(
                    "SELECT id, station_id, observed_at, actor_id FROM register_observations"
                    " WHERE state::text = 'accepted' AND reviewed_at IS NULL"
                    " AND kind = 'SYNOP' AND observed_at >= :since"
                    " ORDER BY observed_at LIMIT :limit"
                ),
                {"since": moment - LOOKBACK, "limit": MAX_ROWS},
            )
        )
        .mappings()
        .all()
    )
    if not rows:
        return 0
    reviewers = await gms.permission_holders(session, gms.REGISTER_REVIEW_PERMISSIONS)
    told = 0
    for row in rows:
        observer = _user_id(row["actor_id"])
        told += await gms.tell(
            session,
            gms.REVIEW_REQUESTED,
            reviewers,
            {
                "subject": f"observation {row['station_id']}",
                "detail": f"The {_hour_text(row['observed_at'])} observation awaits an optional review.",
            },
            link_path="/wxproducts/hourly",
            entity_type="register_observation",
            entity_id=str(row["id"]),
            dedupe_key=f"{gms.REVIEW_REQUESTED}:register:{row['id']}",
            exclude=(observer,) if observer else (),
            group_key="register",
        )
    return told


def _user_id(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


# ── 7. Query on your record ─────────────────────────────────────────────────


async def record_query(
    session: AsyncSession, register: AsyncSession, now: datetime | None = None
) -> int:
    """A reviewer asked the observer a question; tell the observer once per query."""
    moment = _utc(now)
    rows = (
        (
            await register.execute(
                text(
                    "SELECT id, station_id, observed_at, actor_id, reviewed_at"
                    " FROM register_observations"
                    " WHERE review_outcome = 'query' AND reviewed_at >= :since"
                    " ORDER BY reviewed_at LIMIT :limit"
                ),
                {"since": moment - QUERY_LOOKBACK, "limit": MAX_ROWS},
            )
        )
        .mappings()
        .all()
    )
    told = 0
    for row in rows:
        observer = _user_id(row["actor_id"])
        if observer is None:
            continue
        told += await gms.tell(
            session,
            gms.RECORD_QUERY,
            (observer,),
            {"station": row["station_id"], "hour": _hour_text(row["observed_at"])},
            link_path="/wxproducts/hourly",
            entity_type="register_observation",
            entity_id=str(row["id"]),
            # A new query after a replaced review is a new notification.
            dedupe_key=f"{gms.RECORD_QUERY}:{row['id']}:{row['reviewed_at'].isoformat()}",
        )
    return told


# ── 6. Send failed ──────────────────────────────────────────────────────────


async def send_failed(session: AsyncSession, now: datetime | None = None) -> int:
    """WIS2 publications, observation emails and warning deliveries that gave up."""
    from src.worker import dispatch

    moment = _utc(now)
    since = _naive(moment - LOOKBACK)
    items: list[tuple[str, str, str, str]] = []  # what, detail, entity id, link
    sends = (
        await session.scalars(
            select(ERegisterSend)
            .where(ERegisterSend.status == "failed", ERegisterSend.updated_at >= since)
            .order_by(ERegisterSend.updated_at)
            .limit(MAX_ROWS)
        )
    ).all()
    for send in sends:
        what = "WIS2 publication" if send.target == "wis2" else "observation email"
        items.append(
            (
                what,
                f"The {what} for station {send.station_id} ({_hour_text(send.observed_at.replace(tzinfo=UTC))}) failed after {send.attempts} attempts.",
                f"eregister_send:{send.id}",
                "/wxproducts/hourly",
            )
        )
    jobs = await dispatch.exhausted_jobs(
        session=session,
        max_attempts=worker_settings.CAP_JOB_MAX_ATTEMPTS,
        window=LOOKBACK,
    )
    for job in jobs[:MAX_ROWS]:
        items.append(
            (
                "warning delivery",
                f"The {job.kind} delivery of a warning failed after {job.attempts} attempts.",
                f"cap_job:{job.id}",
                "/cap/integrations",
            )
        )
    if not items:
        return 0
    recipients = await gms.duty_or_holders(session, gms.SENDER_PERMISSIONS, now=moment)
    told = 0
    for what, detail, entity_id, link in items:
        told += await gms.tell(
            session,
            gms.SEND_FAILED,
            recipients,
            {"what": what, "detail": detail},
            link_path=link,
            entity_type=entity_id.split(":")[0],
            entity_id=entity_id.split(":", 1)[1],
            dedupe_key=f"{gms.SEND_FAILED}:{entity_id}",
        )
    return told


# ── 8. New National Hurricane Center product ────────────────────────────────


async def nhc_products(
    session: AsyncSession, archive: AsyncSession, now: datetime | None = None
) -> int:
    """A National Hurricane Center product was downloaded into the archive."""
    moment = _utc(now)
    rows = (
        (
            await archive.execute(
                text(
                    "SELECT id, product_key FROM archive_nhc_events"
                    " WHERE outcome = 'downloaded' AND retrieved_at >= :since"
                    " ORDER BY retrieved_at LIMIT :limit"
                ),
                {"since": moment - NHC_LOOKBACK, "limit": MAX_ROWS},
            )
        )
        .mappings()
        .all()
    )
    if not rows:
        return 0
    staff = await gms.gms_staff(session)
    told = 0
    for row in rows:
        told += await gms.tell(
            session,
            gms.NHC_PRODUCT,
            staff,
            {"product": row["product_key"]},
            link_path="/wxproducts/nhc",
            entity_type="nhc_event",
            entity_id=str(row["id"]),
            dedupe_key=f"{gms.NHC_PRODUCT}:{row['id']}",
        )
    return told


# ── Runner ──────────────────────────────────────────────────────────────────

Step = Callable[[], Awaitable[int]]


async def run(
    session: AsyncSession,
    *,
    weather: AsyncSession | None = None,
    register: AsyncSession | None = None,
    archive: AsyncSession | None = None,
    now: datetime | None = None,
) -> int:
    """Run every sweep whose source is available; one failing sweep never blocks another."""
    steps: dict[str, Step] = {
        "warning_expiring": lambda: warning_expiring(session, now),
        "send_failed": lambda: send_failed(session, now),
    }
    if weather is not None:
        steps["forecast_overdue"] = lambda: forecast_overdue(session, weather, now)
    if register is not None:
        steps["observation_missing"] = lambda: observation_missing(
            session, register, now
        )
        steps["register_review_requested"] = lambda: register_review_requested(
            session, register, now
        )
        steps["record_query"] = lambda: record_query(session, register, now)
    if archive is not None:
        steps["nhc_products"] = lambda: nhc_products(session, archive, now)
    total = 0
    for name, step in steps.items():
        try:
            total += await step()
            await session.commit()
        except Exception:
            logger.exception("GMS notification sweep failed", extra={"sweep": name})
            used = (session, weather, register, archive)
            for each in {id(s): s for s in used if s is not None}.values():
                try:
                    await each.rollback()
                except Exception:
                    logger.exception("GMS sweep rollback failed", extra={"sweep": name})
    logger.info("GMS notification sweeps finished", extra={"notified": total})
    return total
