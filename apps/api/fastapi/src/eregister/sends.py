"""Email and WIS2 hand-off of a register observation (queue side).

Requests only queue work: email rows go to the notifications outbox
(``outbound_email``) and the WIS2 CSV waits in the send log for the ARQ job in
``publisher.py``. Both rows commit together with the send log entry.
"""

import html
import logging
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppException
from src.notifications import service as notification_service
from src.notifications.config import notification_settings
from src.notifications.models import OutboundEmail, OutboundEmailStatus
from src.utils.datetime import utc_now

from . import encode, entries, gate, rules
from .config import eregister_settings, wis2box_settings
from .models import (
    STATUS_FAILED,
    STATUS_QUEUED,
    STATUS_SENT,
    TARGET_EMAIL,
    TARGET_WIS2,
    ERegisterSend,
)
from .schemas import (
    ObservationSend,
    SendStatus,
    SendTarget,
    SynopDecoded,
    SynopWorkbook,
)

logger = logging.getLogger(__name__)

NOT_SENDABLE_STATES = ("rejected", "superseded")
# Accepted (by the observer or other register staff) is enough to leave the
# building; the optional review never holds WIS2 or email back.
SENDABLE_ACCEPTED_STATES = ("accepted",)


class SendableObservation:
    def __init__(
        self,
        row: dict[str, Any],
        workbook: SynopWorkbook,
        decoded: SynopDecoded,
    ) -> None:
        self.row = row
        self.workbook = workbook
        self.decoded = decoded

    @property
    def observed_at(self) -> datetime:
        return cast(datetime, self.row["observed_at"])

    @property
    def station_id(self) -> str:
        return str(self.row["station_id"])


async def load_sendable(
    session: AsyncSession, observation_id: UUID, *, require_accepted: bool = False
) -> SendableObservation:
    """Fetch an observation and require that it is fit to leave the building."""
    result = await session.execute(
        text("SELECT * FROM register_observations WHERE id = :id"),
        {"id": str(observation_id)},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(404, "Observation not found")
    data = dict(row)
    if data["kind"] != "SYNOP":
        raise HTTPException(409, "Only SYNOP observations can be sent")
    state = data["state"]
    if state in NOT_SENDABLE_STATES:
        raise HTTPException(409, f"A {state} observation cannot be sent")
    if (
        require_accepted or eregister_settings.SEND_REQUIRE_ACCEPTED
    ) and state not in SENDABLE_ACCEPTED_STATES:
        raise HTTPException(409, "Only QC-accepted observations can be sent")
    issues = entries.validation_issues(
        data["body"] or {}, data["observed_at"], stored=True
    )
    errors = [issue for issue in issues if issue.severity == "error"]
    if errors:
        detail = "; ".join(f"{issue.field}: {issue.message}" for issue in errors[:3])
        raise HTTPException(422, f"Observation does not pass validation: {detail}")
    workbook = encode.workbook_from_body(data["body"] or {})
    _, decoded = rules.validate_synop(workbook, recompute=False)
    return SendableObservation(data, workbook, decoded)


async def _claim(
    session: AsyncSession, observation_id: UUID, target: str, *, resend: bool
) -> None:
    """Serialise sends per observation and target; refuse an unasked repeat."""
    await session.execute(
        select(
            func.pg_advisory_xact_lock(
                func.hashtextextended(f"eregister-send:{observation_id}:{target}", 0)
            )
        )
    )
    existing = await session.scalar(
        select(func.count())
        .select_from(ERegisterSend)
        .where(
            ERegisterSend.observation_id == observation_id,
            ERegisterSend.target == target,
            ERegisterSend.status.in_((STATUS_QUEUED, STATUS_SENT)),
        )
    )
    if existing and not resend:
        label = "emailed" if target == TARGET_EMAIL else "queued for WIS2"
        raise HTTPException(
            409,
            f"{REPEAT_SEND_PREFIX}{label}. Send again with resend=true.",
        )


def _to_read(row: ERegisterSend) -> ObservationSend:
    return ObservationSend(
        id=row.id,
        observation_id=row.observation_id,
        target=cast(SendTarget, row.target),
        status=cast(SendStatus, row.status),
        recipients=row.recipients,
        attempts=row.attempts,
        last_error=row.last_error,
        queued_at=row.created_at,
        sent_at=row.sent_at,
        is_correction=bool(row.detail.get("correction")),
    )


def _celsius(kelvin: float | None) -> str:
    return "-" if kelvin is None else f"{kelvin - 273.15:.1f} °C"


def email_content(item: SendableObservation, tac: str) -> tuple[str, str]:
    state = item.row.get("state")
    correction = bool(item.row.get("supersedes_id"))
    observed = item.observed_at.astimezone(UTC)
    subject = (
        f"{'CORRECTION ' if correction else ''}SYNOP {item.station_id} "
        f"{observed:%d %b %Y %H%M}Z"
    )
    # CCA marks a corrected report in the bulletin header (WMO-No. 386).
    tac = f"CCA\n{tac}" if correction else tac
    decoded = item.decoded
    wind = (
        "-"
        if decoded.wind_speed_ms is None
        else f"{decoded.wind_direction_deg or 0:03d}° at {decoded.wind_speed_ms:.1f} m/s"
    )
    pressure = (
        "-"
        if decoded.mean_sea_level_pressure_pa is None
        else f"{decoded.mean_sea_level_pressure_pa / 100:.1f} hPa"
    )
    visibility = (
        "-" if decoded.visibility_m is None else f"{decoded.visibility_m / 1000:g} km"
    )
    rows = (
        ("Air temperature", _celsius(decoded.air_temperature_k)),
        ("Dew point", _celsius(decoded.dew_point_k)),
        ("Wind", wind),
        ("MSL pressure", pressure),
        ("Visibility", visibility),
    )
    table = "".join(
        f"<tr><td style='padding:2px 12px 2px 0'>{html.escape(label)}</td>"
        f"<td>{html.escape(value)}</td></tr>"
        for label, value in rows
    )
    note = (item.workbook.notes or "").strip()
    body = (
        f"<p>SYNOP observation for station {html.escape(item.station_id)} at "
        f"{observed:%d %b %Y %H%M} UTC.</p>"
        f"<pre style='font-size:14px'>{html.escape(tac)}</pre>"
        f"<table>{table}</table>"
        + (f"<p>Notes: {html.escape(note)}</p>" if note else "")
        + "<p style='color:#666'>Sent from the GMS eRegister. "
        + ("Accepted." if state == "accepted" else "Provisional until accepted.")
        + "</p>"
    )
    return subject, body


async def queue_email(
    *,
    session: AsyncSession,
    item: SendableObservation,
    observation_id: UUID,
    user: User,
    resend: bool,
) -> ObservationSend:
    recipients = eregister_settings.recipients
    if not recipients:
        raise HTTPException(409, "No recipients configured")
    await _claim(session, observation_id, TARGET_EMAIL, resend=resend)
    subject, body = email_content(item, encode.synop_tac(item.workbook))
    outbox: list[OutboundEmail] = [
        notification_service.enqueue_email(
            session=session,
            to_email=address,
            subject=subject,
            transactional=True,
            html=body,
        )
        for address in recipients
    ]
    await session.flush()
    log = ERegisterSend(
        observation_id=observation_id,
        station_id=item.station_id,
        observed_at=item.observed_at.astimezone(UTC).replace(tzinfo=None),
        target=TARGET_EMAIL,
        status=STATUS_QUEUED,
        recipients=len(recipients),
        detail={
            "email_ids": [str(mail.id) for mail in outbox],
            "correction": bool(item.row.get("supersedes_id")),
        },
        created_by=user.id,
    )
    session.add(log)
    await session.commit()
    await session.refresh(log)
    return _to_read(log)


def wis2_unavailable_reason(item: SendableObservation) -> str | None:
    if wis2box_settings.sink is None:
        return "WIS2 publication is not configured"
    local = wis2box_settings.WIS2BOX_WIGOS_ID.rsplit("-", 1)[-1]
    for station in (item.station_id, item.workbook.station_id):
        if station != local:
            return f"Station {station} is not configured for WIS2 publication"
    return None


async def retire_queued_wis2(session: AsyncSession, superseded: list[UUID]) -> None:
    """Stop queued WIS2 files of observations a correction replaces.

    The original and its correction go to one filename, so a retry of the original
    after the correction was delivered would overwrite the corrected data. The row
    lock waits for a delivery already in progress; that file then goes out first and
    the correction follows it. Same transaction as the correction's own row.
    """
    if not superseded:
        return
    stale = await session.scalars(
        select(ERegisterSend)
        .where(
            ERegisterSend.observation_id.in_(superseded),
            ERegisterSend.target == TARGET_WIS2,
            ERegisterSend.status == STATUS_QUEUED,
        )
        .order_by(ERegisterSend.id)
        .with_for_update()
    )
    for row in stale:
        row.status = STATUS_FAILED
        row.next_retry_at = None
        row.last_error = "Replaced by a correction before it was delivered"
        row.detail = {k: v for k, v in (row.detail or {}).items() if k != "content"}


async def lock_wis2_hour(
    session: AsyncSession, station_id: str, observed_at: datetime
) -> None:
    """Serialise WIS2 queueing for one station-hour across a correction chain.

    An original and its correction write one filename, so they must not interleave:
    without this an original paused after claiming the gate could commit its send row
    after the correction retired the originals, and be delivered over it. Held to the
    commit of the send row.
    """
    hour = observed_at.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    await session.execute(
        select(
            func.pg_advisory_xact_lock(
                func.hashtextextended(
                    f"eregister-wis2:{station_id}:{hour.isoformat()}", 0
                )
            )
        )
    )


REPEAT_SEND_PREFIX = "This observation was already "
HELD_UNTIL = datetime(9999, 12, 31)  # next_retry_at is a naive UTC column
HELD_NOTE = "Held while a correction is pending"


async def hold_after_correction(
    session: AsyncSession,
    *,
    station_id: str,
    observed_at: datetime,
    superseded_id: UUID,
) -> None:
    """Hold the queued WIS2 file of an observation a correction has replaced.

    The correction may never be accepted; until it is decided, the replaced reading
    must not go out on a retry. Accepting the correction retires the held file
    (``retire_queued_wis2``); rejecting it releases the file (``release_held_wis2``).
    Takes the same per-hour lock as queueing, so a file being delivered finishes
    first and one being queued is seen. Idempotent.
    """
    await lock_wis2_hour(session, station_id, observed_at)
    held = await session.scalars(
        select(ERegisterSend)
        .where(
            ERegisterSend.observation_id == superseded_id,
            ERegisterSend.target == TARGET_WIS2,
            ERegisterSend.status == STATUS_QUEUED,
        )
        .order_by(ERegisterSend.id)
        .with_for_update()
    )
    for row in held:
        row.next_retry_at = HELD_UNTIL
        row.last_error = HELD_NOTE
        row.detail = {**(row.detail or {}), "held_for_correction": True}
    await session.commit()


async def has_held_wis2(session: AsyncSession, original_id: UUID) -> bool:
    """True when a queued WIS2 file of ``original_id`` waits on a correction."""
    rows = await session.scalars(
        select(ERegisterSend).where(
            ERegisterSend.observation_id == original_id,
            ERegisterSend.target == TARGET_WIS2,
            ERegisterSend.status == STATUS_QUEUED,
        )
    )
    return any((row.detail or {}).get("held_for_correction") for row in rows)


async def release_held_wis2(
    session: AsyncSession,
    *,
    station_id: str,
    observed_at: datetime,
    original_id: UUID,
) -> None:
    """Let a held file go out again because its correction was rejected."""
    await lock_wis2_hour(session, station_id, observed_at)
    held = await session.scalars(
        select(ERegisterSend)
        .where(
            ERegisterSend.observation_id == original_id,
            ERegisterSend.target == TARGET_WIS2,
            ERegisterSend.status == STATUS_QUEUED,
        )
        .order_by(ERegisterSend.id)
        .with_for_update()
    )
    for row in held:
        if (row.detail or {}).get("held_for_correction"):
            row.next_retry_at = None
            row.last_error = None
            row.detail = {
                k: v for k, v in row.detail.items() if k != "held_for_correction"
            }
    await session.commit()


async def queue_wis2(
    *,
    session: AsyncSession,
    register: AsyncSession,
    item: SendableObservation,
    observation_id: UUID,
    user: User,
    resend: bool,
) -> ObservationSend:
    del resend  # WIS2 files are never repeated (ADR-0032)
    reason = wis2_unavailable_reason(item)
    if reason:
        raise HTTPException(409, reason)
    await lock_wis2_hour(session, item.station_id, item.observed_at)
    # Recheck under the lock: a correction may have replaced this observation while
    # this request waited.
    current = await register.scalar(
        text("SELECT state FROM register_observations WHERE id = :id"),
        {"id": str(observation_id)},
    )
    if current in NOT_SENDABLE_STATES:
        raise HTTPException(409, f"A {current} observation cannot be sent")
    # The gate comes first: an hour owned by the automatic source is never
    # queued, and a station-hour is claimed by one observation only. A WIS2
    # file is never queued twice, so `resend` does not apply here.
    superseded = (
        await gate.ancestors(register, observation_id)
        if item.row.get("supersedes_id")
        else []
    )
    holder = await gate.hour_holder(
        register, station_id=item.station_id, observed_at=item.observed_at
    )
    correction = holder is not None and holder in superseded
    claimed = await gate.claim_manual_hour(
        register,
        station_id=item.station_id,
        observed_at=item.observed_at,
        observation_id=observation_id,
        actor=str(user.id),
        supersedes=superseded,
    )
    try:
        await _claim(session, observation_id, TARGET_WIS2, resend=False)
        await retire_queued_wis2(session, superseded)
    except BaseException:
        if claimed:
            await gate.release_hour(
                register,
                station_id=item.station_id,
                observed_at=item.observed_at,
                observation_id=observation_id,
            )
        raise
    observed = item.observed_at.astimezone(UTC)
    row = encode.wis2_row(item.workbook, item.decoded, observed, wis2box_settings)
    filename = encode.wis2_filename(wis2box_settings, observed)
    key = f"{wis2box_settings.WIS2BOX_TOPIC_HIERARCHY.strip('/')}/{filename}"
    log = ERegisterSend(
        observation_id=observation_id,
        station_id=item.station_id,
        observed_at=observed.replace(tzinfo=None),
        target=TARGET_WIS2,
        status=STATUS_QUEUED,
        detail={
            "key": key,
            "filename": filename,
            "content": encode.wis2_csv(row),
            # The Surface-RA-IV-100 CSV has no correction column (see the
            # conformance doc), so the flag lives here and in the email only.
            "correction": correction,
        },
        created_by=user.id,
    )
    session.add(log)
    await session.commit()
    await session.refresh(log)
    return _to_read(log)


async def list_sends(
    session: AsyncSession, observation_id: UUID
) -> list[ObservationSend]:
    result = await session.scalars(
        select(ERegisterSend)
        .where(ERegisterSend.observation_id == observation_id)
        .order_by(ERegisterSend.created_at.desc())
    )
    logs = list(result)
    changed = False
    for log in logs:
        if log.target == TARGET_EMAIL and log.status == STATUS_QUEUED:
            changed |= await _settle_email(session, log)
    if changed:
        await session.commit()
    return [_to_read(log) for log in logs]


async def _settle_email(session: AsyncSession, log: ERegisterSend) -> bool:
    """Mirror the outbox: sent when every mail left, failed when one gave up."""
    ids = [UUID(value) for value in log.detail.get("email_ids", [])]
    if not ids:
        return False
    mails = list(
        await session.scalars(select(OutboundEmail).where(OutboundEmail.id.in_(ids)))
    )
    max_attempts = notification_settings.NOTIFICATIONS_MAX_ATTEMPTS
    if not mails:
        return False
    waiting = [
        mail
        for mail in mails
        if mail.status == OutboundEmailStatus.PENDING.value
        or (
            mail.status == OutboundEmailStatus.FAILED.value
            and mail.attempts < max_attempts
        )
    ]
    if waiting:
        return False
    gave_up = [mail for mail in mails if mail.status != OutboundEmailStatus.SENT.value]
    if gave_up:
        log.status = STATUS_FAILED
        log.last_error = (gave_up[0].last_error or "Email delivery failed")[:1000]
        return True
    log.status = STATUS_SENT
    log.sent_at = max(mail.sent_at or utc_now() for mail in mails)
    return True


async def dispatch_after_acceptance(
    *,
    session: AsyncSession,
    register: AsyncSession,
    observation_id: UUID,
    user: User,
) -> None:
    """Queue WIS2 and email once the observer has accepted.

    Best effort: a hand-off that is refused (hour owned by the automatic source,
    WIS2 or recipients not configured) never undoes the acceptance. It is recorded
    as a failed send with the reason, so the send history explains why nothing went.
    """
    # A refused hand-off rolls the session back, which expires the user object; keep
    # the id so the failed-send record and the next hand-off do not touch it.
    actor_id = user.id
    for target in (TARGET_WIS2, TARGET_EMAIL):
        item: SendableObservation | None = None
        try:
            item = await load_sendable(register, observation_id, require_accepted=True)
            if target == TARGET_WIS2:
                await queue_wis2(
                    session=session,
                    register=register,
                    item=item,
                    observation_id=observation_id,
                    user=user,
                    resend=False,
                )
            else:
                await queue_email(
                    session=session,
                    item=item,
                    observation_id=observation_id,
                    user=user,
                    resend=False,
                )
        except (HTTPException, AppException) as exc:
            await session.rollback()
            detail = str(getattr(exc, "detail", None) or getattr(exc, "message", ""))
            logger.info(
                "eRegister %s hand-off skipped after acceptance: %s", target, detail
            )
            if user in session:
                await session.refresh(user)
            if item is not None and not detail.startswith(REPEAT_SEND_PREFIX):
                try:
                    await _record_refused(
                        session, item, observation_id, target, detail, actor_id
                    )
                except Exception:
                    # The acceptance is already committed; never turn it into a 500.
                    await session.rollback()
                    logger.exception("Could not record the refused %s hand-off", target)


async def _record_refused(
    session: AsyncSession,
    item: SendableObservation,
    observation_id: UUID,
    target: str,
    reason: str,
    actor_id: UUID,
) -> None:
    """Keep a refused automatic hand-off visible in the send history."""
    session.add(
        ERegisterSend(
            observation_id=observation_id,
            station_id=item.station_id,
            observed_at=item.observed_at.astimezone(UTC).replace(tzinfo=None),
            target=target,
            status=STATUS_FAILED,
            attempts=0,
            last_error=reason[:1000],
            detail={"refused": True},
            created_by=actor_id,
        )
    )
    await session.commit()
