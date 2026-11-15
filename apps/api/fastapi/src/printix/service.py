"""Printix ticket registry logic (ADR-0060).

Admission is one conditional ``UPDATE ... WHERE admitted_at IS NULL RETURNING``:
PostgreSQL makes the second of two concurrent updates wait for the first, then
re-check its ``WHERE`` against the committed row, so exactly one phone gets a row
back. The loser reads the stored first admission and reports it. The same shape
guards voiding, so a void and an admission cannot both win.

Scan caps are counted under a per-pairing transaction advisory lock, so two
concurrent scans of one pairing cannot both read a count below the cap.

Times are naive UTC, like the rest of the app. Routers convert the timezone-aware
input before calling in. Administrator writes name the acting user in the session
(``audit.service.set_actor``), so the audit log records who did them.
"""

import hashlib
import hmac
import logging
import re
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import case, delete, func, insert, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from src.audit import service as audit_service
from src.exceptions import AppValidationError
from src.utils.datetime import utc_now

from . import constants, csv_import, transitions
from .constants import PrintixEventStatus, PrintixScanOutcome, PrintixTicketStatus
from .exceptions import (
    PrintixConflict,
    PrintixImportTooLarge,
    PrintixNotFound,
    PrintixPairingExpired,
    PrintixPairingRevoked,
    PrintixPairingUnknown,
    PrintixRateLimited,
)
from .models import PrintixEvent, PrintixPairing, PrintixScanLog, PrintixTicket
from .schemas import (
    PrintixEventPublic,
    PrintixEventSummary,
    PrintixGateCount,
    PrintixImportIssue,
    PrintixImportReport,
    PrintixPairingCreated,
    PrintixScanResult,
    PrintixTicketPage,
    PrintixTicketPublic,
)

logger = logging.getLogger(__name__)

_SHORT_NUMBER = re.compile(rf"[0-9]{{1,{constants.SHORT_NUMBER_MAX_DIGITS}}}")
_NO_BARCODE_WARNING = (
    "The file has no barcode column, so each barcode defaults to its printed "
    "number. Printed numbers are three digits and can be typed or guessed. Import "
    "the printer's barcode values before the event."
)


def to_naive_utc(moment: datetime) -> datetime:
    """A timezone-aware datetime as naive UTC, the form stored in the database."""
    return moment.astimezone(UTC).replace(tzinfo=None)


def hash_secret(secret: str) -> str:
    """SHA-256 hex of a pairing secret. The secret carries 256 random bits, so a
    fast hash is enough, and no server key is needed (a key rotation would
    otherwise end every pairing)."""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def is_closed(event: PrintixEvent, now: datetime) -> bool:
    return event.status == PrintixEventStatus.CLOSED.value or event.closes_at <= now


async def get_event(session: AsyncSession, event_id: uuid.UUID) -> PrintixEvent:
    event = await session.get(PrintixEvent, event_id)
    if event is None:
        raise PrintixNotFound("Event not found")
    return event


async def _event_for_update(session: AsyncSession, event_id: uuid.UUID) -> PrintixEvent:
    event = await session.scalar(
        select(PrintixEvent)
        .where(PrintixEvent.id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if event is None:
        raise PrintixNotFound("Event not found")
    return event


def event_public(event: PrintixEvent) -> PrintixEventPublic:
    return PrintixEventPublic(
        id=event.id,
        name=event.name,
        event_date=event.event_date,
        closes_at=event.closes_at,
        status=PrintixEventStatus(event.status),
        created_at=event.created_at,
    )


# --- Events -----------------------------------------------------------------


async def create_event(
    session: AsyncSession,
    *,
    name: str,
    event_date: date,
    closes_at: datetime,
    actor_id: uuid.UUID | None = None,
) -> PrintixEvent:
    """``closes_at`` is naive UTC."""
    now = utc_now()
    if closes_at <= now:
        raise AppValidationError("closes_at must be in the future")
    audit_service.set_actor(session, actor_id)
    event = PrintixEvent(
        id=uuid.uuid4(),
        name=name,
        event_date=event_date,
        closes_at=closes_at,
        status=PrintixEventStatus.OPEN.value,
        created_at=now,
    )
    session.add(event)
    await session.commit()
    logger.info("Printix event created", extra={"subject_id": str(event.id)})
    return event


async def close_event(
    session: AsyncSession, event_id: uuid.UUID, *, actor_id: uuid.UUID | None = None
) -> PrintixEvent:
    event = await get_event(session, event_id)
    if event.status != PrintixEventStatus.CLOSED.value:
        audit_service.set_actor(session, actor_id)
        transitions.move_event(event, PrintixEventStatus.CLOSED)
        await session.commit()
        logger.info("Printix event closed", extra={"subject_id": str(event.id)})
    return event


async def event_summary(
    session: AsyncSession, event_id: uuid.UUID
) -> PrintixEventSummary:
    event = await get_event(session, event_id)
    counts = (
        await session.execute(
            select(
                func.count(PrintixTicket.id).filter(
                    PrintixTicket.status == PrintixTicketStatus.VOID.value
                ),
                func.count(PrintixTicket.id).filter(
                    PrintixTicket.status == PrintixTicketStatus.VALID.value
                ),
                func.count(PrintixTicket.id).filter(
                    PrintixTicket.admitted_at.is_not(None)
                ),
            ).where(PrintixTicket.event_id == event.id)
        )
    ).one()
    void, valid, admitted = int(counts[0]), int(counts[1]), int(counts[2])
    duplicates = int(
        await session.scalar(
            select(func.count(PrintixScanLog.id))
            .join(PrintixPairing, PrintixPairing.id == PrintixScanLog.pairing_id)
            .where(
                PrintixPairing.event_id == event.id,
                PrintixScanLog.outcome == PrintixScanOutcome.ALREADY_ADMITTED.value,
            )
        )
        or 0
    )
    gate_rows = (
        await session.execute(
            select(PrintixTicket.admitted_gate, func.count(PrintixTicket.id))
            .where(
                PrintixTicket.event_id == event.id,
                PrintixTicket.admitted_at.is_not(None),
            )
            .group_by(PrintixTicket.admitted_gate)
            .order_by(PrintixTicket.admitted_gate)
        )
    ).all()
    return PrintixEventSummary(
        event=event_public(event),
        issued=valid + void,
        void=void,
        admitted=admitted,
        not_yet_in=valid - admitted,
        duplicates_refused=duplicates,
        admitted_by_gate=[
            PrintixGateCount(gate=str(gate or ""), admitted=int(count))
            for gate, count in gate_rows
        ],
    )


# --- Tickets ----------------------------------------------------------------


async def import_tickets(
    session: AsyncSession,
    event_id: uuid.UUID,
    content: bytes,
    *,
    dry_run: bool,
    actor_id: uuid.UUID | None = None,
) -> PrintixImportReport:
    """Check the file, then (unless ``dry_run``) write every row or none.

    The event row is locked for the write so two imports cannot both pass the
    duplicate check. A dry run takes no lock and writes nothing.
    """
    if len(content) > constants.MAX_IMPORT_BYTES:
        raise PrintixImportTooLarge()
    if dry_run:
        event = await get_event(session, event_id)
    else:
        event = await _event_for_update(session, event_id)
    if is_closed(event, utc_now()):
        raise PrintixConflict("This event is closed, so its tickets cannot change")

    parsed = csv_import.parse_ticket_csv(content)
    issues = [PrintixImportIssue(line=i.line, message=i.message) for i in parsed.errors]
    truncated = parsed.errors_truncated
    if not issues:
        issues.extend(await _clashes_with_event(session, event.id, parsed.rows))
    if len(issues) > constants.MAX_REPORTED_ERRORS:
        truncated = True
        issues = issues[: constants.MAX_REPORTED_ERRORS]
    clean = not issues
    warnings = [] if parsed.has_barcode_column else [_NO_BARCODE_WARNING]

    if dry_run or not clean:
        return PrintixImportReport(
            dry_run=dry_run,
            applied=False,
            rows=parsed.row_count,
            to_add=len(parsed.rows) if clean else 0,
            errors=issues,
            errors_truncated=truncated,
            warnings=warnings,
        )

    now = utc_now()
    audit_service.set_actor(session, actor_id)
    await session.execute(
        insert(PrintixTicket),
        [
            {
                "id": uuid.uuid4(),
                "event_id": event.id,
                "printed_number": row.number,
                "barcode_value": row.barcode,
                "status": PrintixTicketStatus.VALID.value,
                "created_at": now,
            }
            for row in parsed.rows
        ],
    )
    # A bulk insert bypasses the flush listener, so the import is recorded here.
    # Ticket values stay out of the history: only the count is written.
    await audit_service.record_change(
        session,
        entity_type="printix_event",
        entity_id=str(event.id),
        record_type="printix_ticket_import",
        record_id=str(event.id),
        action="create",
        changes={"tickets": (None, len(parsed.rows))},
    )
    await session.commit()
    logger.info(
        "Printix tickets imported",
        extra={"subject_id": str(event.id), "target_id": str(event.id)},
    )
    return PrintixImportReport(
        dry_run=False,
        applied=True,
        rows=parsed.row_count,
        to_add=len(parsed.rows),
        errors=[],
        errors_truncated=False,
        warnings=warnings,
    )


async def _clashes_with_event(
    session: AsyncSession, event_id: uuid.UUID, rows: list[csv_import.ParsedRow]
) -> list[PrintixImportIssue]:
    """Rows that collide with a ticket already on this event.

    A barcode lookup runs before a number lookup, so a barcode equal to an
    existing printed number (or a number equal to an existing barcode) would
    shadow that ticket. Both directions are refused.
    """
    if not rows:
        return []
    numbers = {row.number for row in rows}
    barcodes = {row.barcode for row in rows}
    values = numbers | barcodes
    stored = (
        await session.execute(
            select(PrintixTicket.printed_number, PrintixTicket.barcode_value).where(
                PrintixTicket.event_id == event_id,
                PrintixTicket.printed_number.in_(values)
                | PrintixTicket.barcode_value.in_(values),
            )
        )
    ).all()
    taken_numbers = {row[0] for row in stored}
    taken_barcodes = {row[1] for row in stored}
    issues: list[PrintixImportIssue] = []
    for row in rows:
        if row.number in taken_numbers:
            issues.append(
                PrintixImportIssue(
                    line=row.line,
                    message=f"number {row.number} is already on this event",
                )
            )
        elif row.barcode in taken_barcodes:
            issues.append(
                PrintixImportIssue(
                    line=row.line,
                    message="barcode is already on this event",
                )
            )
        elif row.barcode in taken_numbers and row.barcode != row.number:
            issues.append(
                PrintixImportIssue(
                    line=row.line,
                    message="barcode equals the printed number of a ticket on this event",
                )
            )
        elif row.number in taken_barcodes:
            issues.append(
                PrintixImportIssue(
                    line=row.line,
                    message="number equals a barcode already on this event",
                )
            )
    return issues


async def list_tickets(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    status: PrintixTicketStatus | None,
    admitted: bool | None,
    page: int,
    size: int,
) -> PrintixTicketPage:
    filters = [PrintixTicket.event_id == event_id]
    if status is not None:
        filters.append(PrintixTicket.status == status.value)
    if admitted is True:
        filters.append(PrintixTicket.admitted_at.is_not(None))
    elif admitted is False:
        filters.append(PrintixTicket.admitted_at.is_(None))
    total = int(
        await session.scalar(select(func.count(PrintixTicket.id)).where(*filters)) or 0
    )
    all_digits = PrintixTicket.printed_number.regexp_match(r"^[0-9]+$")
    # Digit-only numbers sort numerically (zero-padded), then anything else as text.
    numeric_key = case(
        (all_digits, func.lpad(PrintixTicket.printed_number, 32, "0")),
        else_=PrintixTicket.printed_number,
    )
    rows = await session.scalars(
        select(PrintixTicket)
        .where(*filters)
        .order_by(
            case((all_digits, 0), else_=1),
            numeric_key,
            PrintixTicket.id,
        )
        .offset((page - 1) * size)
        .limit(size)
    )
    return PrintixTicketPage(
        items=[
            PrintixTicketPublic.model_validate(row, from_attributes=True)
            for row in rows.all()
        ],
        total=total,
        page=page,
        size=size,
    )


async def set_ticket_void(
    session: AsyncSession,
    ticket_id: uuid.UUID,
    *,
    void: bool,
    actor_id: uuid.UUID | None = None,
) -> PrintixTicket:
    """Void or restore a ticket. An admitted ticket cannot be voided, and nothing
    changes once the event has closed."""
    ticket = await session.get(PrintixTicket, ticket_id)
    if ticket is None:
        raise PrintixNotFound("Ticket not found")
    event = await get_event(session, ticket.event_id)
    if is_closed(event, utc_now()):
        raise PrintixConflict("This event is closed, so its tickets cannot change")
    target = PrintixTicketStatus.VOID if void else PrintixTicketStatus.VALID
    if ticket.status == target.value:
        return ticket
    transitions.check_ticket_move(
        ticket.status, target, admitted=ticket.admitted_at is not None
    )
    current = PrintixTicketStatus.VALID if void else PrintixTicketStatus.VOID
    conditions = [PrintixTicket.id == ticket_id, PrintixTicket.status == current.value]
    if void:
        conditions.append(PrintixTicket.admitted_at.is_(None))
    changed = await session.execute(
        update(PrintixTicket)
        .where(*conditions)
        .values(status=target.value)
        .returning(PrintixTicket.id)
        .execution_options(synchronize_session=False)
    )
    if changed.first() is None:
        await session.rollback()
        stored = await session.get(PrintixTicket, ticket_id, populate_existing=True)
        if stored is None:
            raise PrintixNotFound("Ticket not found")
        if stored.status == target.value:
            return stored
        if void and stored.admitted_at is not None:
            raise PrintixConflict(
                "This ticket was already admitted, so it cannot be voided"
            )
        raise PrintixConflict(
            "The ticket changed while it was being updated; try again"
        )
    # A bulk update bypasses the flush listener, so the change is recorded here.
    audit_service.set_actor(session, actor_id)
    await audit_service.record_change(
        session,
        entity_type="printix_event",
        entity_id=str(ticket.event_id),
        record_type="printix_ticket",
        record_id=str(ticket_id),
        action="update",
        changes={"status": (current.value, target.value)},
    )
    await session.commit()
    refreshed = await session.get(PrintixTicket, ticket_id, populate_existing=True)
    if refreshed is None:
        raise PrintixNotFound("Ticket not found")
    logger.info(
        "Printix ticket status set to %s",
        target.value,
        extra={"subject_id": str(ticket_id)},
    )
    return refreshed


# --- Pairings ---------------------------------------------------------------


async def create_pairing(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    gate: str,
    expires_at: datetime | None,
    actor_id: uuid.UUID | None = None,
    allow_typed_numbers: bool = False,
) -> tuple[PrintixPairing, str]:
    """A new pairing and its secret. ``expires_at`` is naive UTC or None."""
    event = await get_event(session, event_id)
    now = utc_now()
    if is_closed(event, now):
        raise PrintixConflict("This event is closed, so no new pairings can be made")
    if expires_at is None:
        expires_at = event.closes_at + constants.PAIRING_DEFAULT_AFTER_CLOSE
    else:
        if expires_at <= now:
            raise AppValidationError("expires_at must be in the future")
        if expires_at > event.closes_at + constants.PAIRING_MAX_AFTER_CLOSE:
            raise AppValidationError(
                "expires_at must be at most a day after the event closes"
            )
    secret = secrets.token_urlsafe(constants.PAIRING_SECRET_BYTES)
    audit_service.set_actor(session, actor_id)
    pairing = PrintixPairing(
        id=uuid.uuid4(),
        event_id=event.id,
        gate=gate,
        token_hash=hash_secret(secret),
        expires_at=expires_at,
        revoked_at=None,
        allow_typed_numbers=allow_typed_numbers,
        created_by=actor_id,
        created_at=now,
    )
    session.add(pairing)
    await session.commit()
    logger.info(
        "Printix pairing created",
        extra={"subject_id": str(pairing.id), "target_id": str(event.id)},
    )
    return pairing, secret


async def list_pairings(
    session: AsyncSession, event_id: uuid.UUID
) -> list[PrintixPairing]:
    rows = await session.scalars(
        select(PrintixPairing)
        .where(PrintixPairing.event_id == event_id)
        .order_by(PrintixPairing.created_at.desc(), PrintixPairing.id)
        .limit(500)
    )
    return list(rows.all())


async def revoke_pairing(
    session: AsyncSession, pairing_id: uuid.UUID, *, actor_id: uuid.UUID | None = None
) -> PrintixPairing:
    pairing = await session.get(PrintixPairing, pairing_id)
    if pairing is None:
        raise PrintixNotFound("Pairing not found")
    if pairing.revoked_at is None:
        audit_service.set_actor(session, actor_id)
        pairing.revoked_at = utc_now()
        await session.commit()
        logger.info("Printix pairing revoked", extra={"subject_id": str(pairing.id)})
    return pairing


async def authenticate_pairing(
    session: AsyncSession, secret: str | None
) -> PrintixPairing:
    """The pairing for a presented secret. Checked on every call."""
    if secret is None or not (
        constants.PAIRING_SECRET_MIN_LENGTH
        <= len(secret)
        <= constants.PAIRING_SECRET_MAX_LENGTH
    ):
        raise PrintixPairingUnknown()
    digest = hash_secret(secret)
    pairing = await session.scalar(
        select(PrintixPairing).where(PrintixPairing.token_hash == digest)
    )
    if pairing is None or not hmac.compare_digest(pairing.token_hash, digest):
        raise PrintixPairingUnknown()
    if pairing.revoked_at is not None:
        raise PrintixPairingRevoked()
    if pairing.expires_at <= utc_now():
        raise PrintixPairingExpired()
    return pairing


def pairing_created(pairing: PrintixPairing, secret: str) -> PrintixPairingCreated:
    return PrintixPairingCreated(
        id=pairing.id,
        gate=pairing.gate,
        created_at=pairing.created_at,
        expires_at=pairing.expires_at,
        revoked_at=pairing.revoked_at,
        allow_typed_numbers=pairing.allow_typed_numbers,
        secret=secret,
    )


# --- Admission --------------------------------------------------------------


async def _lock_pairing(session: AsyncSession, pairing_id: uuid.UUID) -> None:
    """Serialise one pairing's scans until commit, so its caps are counted exactly."""
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": str(pairing_id)},
    )


async def _count_scans(
    session: AsyncSession,
    pairing_id: uuid.UUID,
    now: datetime,
    *conditions: ColumnElement[bool],
) -> int:
    since = now - timedelta(seconds=constants.SCAN_WINDOW_SECONDS)
    return int(
        await session.scalar(
            select(func.count(PrintixScanLog.id)).where(
                PrintixScanLog.pairing_id == pairing_id,
                PrintixScanLog.scanned_at > since,
                *conditions,
            )
        )
        or 0
    )


def _refuse_scan(pairing: PrintixPairing, cap: str) -> PrintixRateLimited:
    logger.warning(
        "Printix scan cap reached: %s",
        cap,
        extra={"subject_id": str(pairing.id)},
    )
    return PrintixRateLimited()


async def _barcode_ticket(
    session: AsyncSession, event_id: uuid.UUID, value: str
) -> PrintixTicket | None:
    if not value:
        return None
    ticket: PrintixTicket | None = await session.scalar(
        select(PrintixTicket).where(
            PrintixTicket.event_id == event_id,
            PrintixTicket.barcode_value == value,
        )
    )
    return ticket


async def _printed_number_ticket(
    session: AsyncSession, event_id: uuid.UUID, value: str
) -> PrintixTicket | None:
    ticket: PrintixTicket | None = await session.scalar(
        select(PrintixTicket).where(
            PrintixTicket.event_id == event_id,
            PrintixTicket.printed_number == value,
        )
    )
    return ticket


async def _stamp_if_unadmitted(
    session: AsyncSession, ticket_id: uuid.UUID, pairing: PrintixPairing, now: datetime
) -> bool:
    """True only for the one caller whose conditional UPDATE changed the row."""
    won = await session.execute(
        update(PrintixTicket)
        .where(
            PrintixTicket.id == ticket_id,
            PrintixTicket.status == PrintixTicketStatus.VALID.value,
            PrintixTicket.admitted_at.is_(None),
        )
        .values(
            admitted_at=now, admitted_gate=pairing.gate, admitted_pairing=pairing.id
        )
        .returning(PrintixTicket.id)
        .execution_options(synchronize_session=False)
    )
    return won.first() is not None


async def admit(
    session: AsyncSession, pairing: PrintixPairing, value: str
) -> PrintixScanResult:
    """Admit a scanned value to the pairing's event, and log the outcome.

    Order: take the pairing's lock; check the scan cap, then the typed-number cap;
    look up (barcode, then printed number only for a typed attempt on a pairing
    that allows it); refuse an unknown outcome past its cap; log and commit. A
    refused scan is not logged, so a flood cannot fill the log.
    """
    now = utc_now()
    await _lock_pairing(session, pairing.id)
    if await _count_scans(session, pairing.id, now) >= constants.SCANS_PER_WINDOW:
        raise _refuse_scan(pairing, "scans")

    value = value.strip()
    typed_attempt = pairing.allow_typed_numbers and bool(_SHORT_NUMBER.fullmatch(value))
    if typed_attempt and (
        await _count_scans(session, pairing.id, now, PrintixScanLog.typed.is_(True))
        >= constants.TYPED_NUMBER_SCANS_PER_WINDOW
    ):
        raise _refuse_scan(pairing, "typed numbers")

    event = await get_event(session, pairing.event_id)
    ticket: PrintixTicket | None = None
    typed = False
    outcome: PrintixScanOutcome
    if is_closed(event, now):
        outcome = PrintixScanOutcome.EVENT_CLOSED
    else:
        ticket = await _barcode_ticket(session, event.id, value)
        if ticket is None and typed_attempt:
            ticket = await _printed_number_ticket(session, event.id, value)
            typed = True
        if ticket is None:
            outcome = PrintixScanOutcome.UNKNOWN
        elif ticket.status == PrintixTicketStatus.VOID.value:
            outcome = PrintixScanOutcome.VOID
        elif await _stamp_if_unadmitted(session, ticket.id, pairing, now):
            outcome = PrintixScanOutcome.ADMITTED
        else:
            outcome = PrintixScanOutcome.ALREADY_ADMITTED
        if ticket is not None:
            # Reload: the conditional UPDATE bypassed the session's identity map.
            ticket = await session.get(PrintixTicket, ticket.id, populate_existing=True)
            if ticket is not None and ticket.status == PrintixTicketStatus.VOID.value:
                outcome = PrintixScanOutcome.VOID

    if outcome is PrintixScanOutcome.UNKNOWN and (
        await _count_scans(
            session,
            pairing.id,
            now,
            PrintixScanLog.outcome == PrintixScanOutcome.UNKNOWN.value,
        )
        >= constants.UNKNOWN_SCANS_PER_WINDOW
    ):
        raise _refuse_scan(pairing, "unknown")

    session.add(
        PrintixScanLog(
            id=uuid.uuid4(),
            pairing_id=pairing.id,
            ticket_id=ticket.id if ticket is not None else None,
            outcome=outcome.value,
            value=value[: constants.SCAN_VALUE_LOG_LENGTH],
            typed=typed,
            scanned_at=now,
        )
    )
    await session.commit()
    logger.info(
        "Printix scan outcome %s",
        outcome.value,
        extra={"subject_id": str(pairing.id), "target_id": str(event.id)},
    )

    shown = ticket if outcome is not PrintixScanOutcome.UNKNOWN else None
    stamped = (
        ticket
        if outcome
        in (
            PrintixScanOutcome.ADMITTED,
            PrintixScanOutcome.ALREADY_ADMITTED,
        )
        else None
    )
    return PrintixScanResult(
        outcome=outcome,
        printed_number=shown.printed_number if shown is not None else None,
        admitted_at=stamped.admitted_at if stamped is not None else None,
        admitted_gate=stamped.admitted_gate if stamped is not None else None,
    )


# --- Retention --------------------------------------------------------------


async def purge_scan_log(session: AsyncSession, *, now: datetime) -> int:
    """Delete scan-log rows of events closed more than the retention period ago.

    Keyed on each event's ``closes_at``. Returns the number of rows deleted.
    """
    cutoff = now - timedelta(days=constants.SCAN_LOG_RETENTION_DAYS)
    old_pairings = (
        select(PrintixPairing.id)
        .join(PrintixEvent, PrintixEvent.id == PrintixPairing.event_id)
        .where(PrintixEvent.closes_at < cutoff)
    )
    expired = int(
        await session.scalar(
            select(func.count(PrintixScanLog.id)).where(
                PrintixScanLog.pairing_id.in_(old_pairings)
            )
        )
        or 0
    )
    await session.execute(
        delete(PrintixScanLog).where(PrintixScanLog.pairing_id.in_(old_pairings))
    )
    await session.commit()
    logger.info("Printix scan log purged", extra={"error_type": str(expired)})
    return expired
