"""Email and WIS2 hand-off of a register observation (queue side).

Requests only queue work: email rows go to the notifications outbox
(``outbound_email``) and the WIS2 CSV waits in the send log for the ARQ job in
``publisher.py``. Both rows commit together with the send log entry.
"""

import html
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.notifications import service as notification_service
from src.notifications.config import notification_settings
from src.notifications.models import OutboundEmail, OutboundEmailStatus
from src.utils.datetime import utc_now

from . import encode, rules
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

NOT_SENDABLE_STATES = ("rejected", "superseded")


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
    ) and state != "accepted":
        raise HTTPException(409, "Only QC-accepted observations can be sent")
    workbook = encode.workbook_from_body(data["body"] or {})
    issues, decoded = rules.validate_synop(workbook)
    errors = [issue for issue in issues if issue.severity == "error"]
    if errors:
        detail = "; ".join(f"{issue.field}: {issue.message}" for issue in errors[:3])
        raise HTTPException(422, f"Observation does not pass validation: {detail}")
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
            f"This observation was already {label}. Send again with resend=true.",
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
    )


def _celsius(kelvin: float | None) -> str:
    return "-" if kelvin is None else f"{kelvin - 273.15:.1f} °C"


def email_content(item: SendableObservation, tac: str) -> tuple[str, str]:
    accepted = item.row.get("state") == "accepted"
    observed = item.observed_at.astimezone(UTC)
    subject = f"SYNOP {item.station_id} {observed:%d %b %Y %H%M}Z"
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
        + ("QC-accepted." if accepted else "Provisional until QC-accepted.")
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
        detail={"email_ids": [str(mail.id) for mail in outbox]},
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


async def queue_wis2(
    *,
    session: AsyncSession,
    item: SendableObservation,
    observation_id: UUID,
    user: User,
    resend: bool,
) -> ObservationSend:
    reason = wis2_unavailable_reason(item)
    if reason:
        raise HTTPException(409, reason)
    await _claim(session, observation_id, TARGET_WIS2, resend=resend)
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
        detail={"key": key, "filename": filename, "content": encode.wis2_csv(row)},
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
