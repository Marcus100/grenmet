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

from sqlalchemy import any_, case, delete, func, insert, or_, select, text, update
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from src.audit import service as audit_service
from src.exceptions import AppValidationError
from src.organisations import grants as organisation_grants
from src.organisations import models as organisation_models
from src.organisations import service as organisation_service
from src.utils.datetime import utc_now

from . import constants, csv_import, transitions
from .constants import (
    PrintixEventStatus,
    PrintixOfflineTicketState,
    PrintixScanOutcome,
    PrintixTicketStatus,
)
from .exceptions import (
    PrintixConflict,
    PrintixImportTooLarge,
    PrintixNotFound,
    PrintixOfflineUnavailable,
    PrintixOrganisationIneligible,
    PrintixPairingExpired,
    PrintixPairingRevoked,
    PrintixPairingUnknown,
    PrintixRateLimited,
)
from .models import PrintixEvent, PrintixPairing, PrintixScanLog, PrintixTicket
from .schemas import (
    PrintixEventPage,
    PrintixEventPublic,
    PrintixEventSummary,
    PrintixGateCount,
    PrintixImportIssue,
    PrintixImportReport,
    PrintixOfflineAdmission,
    PrintixOfflineAdmissionResult,
    PrintixOfflineList,
    PrintixOfflineSyncResult,
    PrintixOfflineTicket,
    PrintixOrganiserOrganisation,
    PrintixPairingCreated,
    PrintixScanResult,
    PrintixTicketPage,
    PrintixTicketPublic,
)

logger = logging.getLogger(__name__)

_SHORT_NUMBER = re.compile(rf"[0-9]{{1,{constants.SHORT_NUMBER_MAX_DIGITS}}}")
_NO_BARCODE_COLUMN_WARNING = (
    "The file has no barcode column, so every barcode defaults to its printed "
    "number. Printed numbers are three digits, so a stolen pairing could walk them. "
    "Import the printer's barcode values before the event."
)
_BLANK_BARCODE_WARNING = (
    "{count} row(s) have a blank barcode, so their printed number is used as the "
    "barcode (first on line {first}). Printed numbers are three digits. A real import "
    "is refused unless allow_number_as_barcode is set."
)
_NUMBER_AS_BARCODE_REFUSAL = (
    "This barcode is blank, so the printed number would be the barcode. Give the "
    "barcode, or set allow_number_as_barcode to import it anyway."
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


async def get_event(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    organisation_id: str | None = None,
) -> PrintixEvent:
    """``organisation_id`` None (administrator routes): any event. Given (organiser
    routes): the filter runs in SQL, so an event of another organisation, or one
    with no organisation, is "not found" exactly like a missing id."""
    if organisation_id is None:
        event = await session.get(PrintixEvent, event_id)
    else:
        event = await session.scalar(
            select(PrintixEvent).where(
                PrintixEvent.id == event_id,
                PrintixEvent.organisation_id == organisation_id,
            )
        )
    if event is None:
        raise PrintixNotFound("Event not found")
    return event


async def _event_for_update(
    session: AsyncSession, event_id: uuid.UUID, *, organisation_id: str | None = None
) -> PrintixEvent:
    filters = [PrintixEvent.id == event_id]
    if organisation_id is not None:
        filters.append(PrintixEvent.organisation_id == organisation_id)
    event = await session.scalar(
        select(PrintixEvent)
        .where(*filters)
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
        organisation_id=event.organisation_id,
    )


# --- Events -----------------------------------------------------------------


async def _require_organisation(
    session: AsyncSession, organisation_id: str | None
) -> None:
    """An event may name only an organisation that exists, is active and is entitled
    to printix. Unknown is a 422 ("not found"); the other two are PrintixOrganisationIneligible."""
    if organisation_id is None:
        return
    organisation = await session.get(
        organisation_models.PlatformOrganisation, organisation_id
    )
    if organisation is None:
        raise AppValidationError("Organisation not found")
    if organisation.status != organisation_models.OrganisationStatus.ACTIVE.value:
        raise PrintixOrganisationIneligible()
    if "printix" not in await organisation_grants.entitled_products(
        session, organisation_id
    ):
        raise PrintixOrganisationIneligible()


async def create_event(
    session: AsyncSession,
    *,
    name: str,
    event_date: date,
    closes_at: datetime,
    actor_id: uuid.UUID | None = None,
    organisation_id: str | None = None,
) -> PrintixEvent:
    """``closes_at`` is naive UTC. ``organisation_id`` is optional; without one only
    administrators see the event."""
    now = utc_now()
    if closes_at <= now:
        raise AppValidationError("closes_at must be in the future")
    await _require_organisation(session, organisation_id)
    audit_service.set_actor(session, actor_id)
    event = PrintixEvent(
        id=uuid.uuid4(),
        name=name,
        event_date=event_date,
        closes_at=closes_at,
        status=PrintixEventStatus.OPEN.value,
        created_at=now,
        organisation_id=organisation_id,
    )
    session.add(event)
    await session.commit()
    logger.info("Printix event created", extra={"subject_id": str(event.id)})
    return event


async def set_event_organisation(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    organisation_id: str | None,
    actor_id: uuid.UUID | None = None,
) -> PrintixEvent:
    """Set or clear the organisation that owns an event (administrator only).
    Setting the value it already has changes nothing."""
    event = await get_event(session, event_id)
    await _require_organisation(session, organisation_id)
    if event.organisation_id != organisation_id:
        audit_service.set_actor(session, actor_id)
        event.organisation_id = organisation_id
        await session.commit()
        logger.info(
            "Printix event organisation set", extra={"subject_id": str(event.id)}
        )
    return event


async def organiser_organisations(
    session: AsyncSession, user_id: uuid.UUID
) -> list[PrintixOrganiserOrganisation]:
    """Organisations where ``user_id`` may use the organiser routes.

    Needs an active membership, an active organisation entitled to ``printix``, and at
    least one Printix key in the membership's effective keys (role bundle or live grant,
    ``grants.effective_keys``). The memberships come from ``list_my_memberships``; no
    grant logic is repeated here."""
    result: list[PrintixOrganiserOrganisation] = []
    for membership, organisation in await organisation_service.list_my_memberships(
        session, user_id
    ):
        if organisation.status != organisation_models.OrganisationStatus.ACTIVE.value:
            continue
        if "printix" not in await organisation_grants.entitled_products(
            session, organisation.id
        ):
            continue
        held = await organisation_grants.effective_keys(session, membership=membership)
        events = constants.EVENTS_MANAGE_KEY in held
        gates = constants.GATES_MANAGE_KEY in held
        if events or gates:
            result.append(
                PrintixOrganiserOrganisation(
                    id=organisation.id,
                    name=organisation.name,
                    can_manage_events=events,
                    can_manage_gates=gates,
                )
            )
    return result


async def list_events(
    session: AsyncSession,
    *,
    organisation_id: str | None,
    page: int,
    size: int,
) -> PrintixEventPage:
    """Events, newest date first. ``organisation_id`` None lists every event
    (administrators); given, only that organisation's events (organisers). The
    filter and the page are both in SQL."""
    filters = []
    if organisation_id is not None:
        filters.append(PrintixEvent.organisation_id == organisation_id)
    total = int(
        await session.scalar(select(func.count(PrintixEvent.id)).where(*filters)) or 0
    )
    rows = await session.scalars(
        select(PrintixEvent)
        .where(*filters)
        .order_by(
            PrintixEvent.event_date.desc(),
            PrintixEvent.created_at.desc(),
            PrintixEvent.id,
        )
        .offset((page - 1) * size)
        .limit(size)
    )
    return PrintixEventPage(
        items=[event_public(event) for event in rows.all()],
        total=total,
        page=page,
        size=size,
    )


async def close_event(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    actor_id: uuid.UUID | None = None,
    organisation_id: str | None = None,
) -> PrintixEvent:
    event = await get_event(session, event_id, organisation_id=organisation_id)
    if event.status != PrintixEventStatus.CLOSED.value:
        audit_service.set_actor(session, actor_id)
        transitions.move_event(event, PrintixEventStatus.CLOSED)
        await session.commit()
        logger.info("Printix event closed", extra={"subject_id": str(event.id)})
    return event


async def event_summary(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    organisation_id: str | None = None,
) -> PrintixEventSummary:
    """Summary of one event. ``organisation_id`` as for ``get_event``."""
    event = await get_event(session, event_id, organisation_id=organisation_id)
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
                PrintixScanLog.offline_scanned_at.is_(None),
            )
        )
        or 0
    )
    offline_conflicts = int(
        await session.scalar(
            select(func.count(PrintixScanLog.id))
            .join(PrintixPairing, PrintixPairing.id == PrintixScanLog.pairing_id)
            .where(
                PrintixPairing.event_id == event.id,
                PrintixScanLog.offline_scanned_at.is_not(None),
                PrintixScanLog.outcome != PrintixScanOutcome.ADMITTED.value,
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
        offline_conflicts=offline_conflicts,
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
    allow_number_as_barcode: bool = False,
    organisation_id: str | None = None,
) -> PrintixImportReport:
    """Check the file, then (unless ``dry_run``) write every row or none.

    The event row is locked for the write so two imports cannot both pass the
    duplicate check. A dry run takes no lock and writes nothing.
    """
    if len(content) > constants.MAX_IMPORT_BYTES:
        raise PrintixImportTooLarge()
    if dry_run:
        event = await get_event(session, event_id, organisation_id=organisation_id)
    else:
        event = await _event_for_update(
            session, event_id, organisation_id=organisation_id
        )
    if is_closed(event, utc_now()):
        raise PrintixConflict("This event is closed, so its tickets cannot change")

    parsed = csv_import.parse_ticket_csv(content)
    issues = [PrintixImportIssue(line=i.line, message=i.message) for i in parsed.errors]
    truncated = parsed.errors_truncated
    if not issues:
        issues.extend(await _clashes_with_event(session, event.id, parsed.rows))
    if not dry_run and not allow_number_as_barcode:
        # A barcode that defaults to a three-digit number lets a stolen pairing
        # enumerate the event. Refused on the real import only; the dry run warns.
        issues.extend(
            PrintixImportIssue(line=line, message=_NUMBER_AS_BARCODE_REFUSAL)
            for line in parsed.defaulted_lines
        )
    if len(issues) > constants.MAX_REPORTED_ERRORS:
        truncated = True
        issues = issues[: constants.MAX_REPORTED_ERRORS]
    clean = not issues
    warnings: list[str] = []
    if parsed.header_ok and parsed.defaulted_lines:
        if parsed.has_barcode_column:
            warnings.append(
                _BLANK_BARCODE_WARNING.format(
                    count=len(parsed.defaulted_lines), first=parsed.defaulted_lines[0]
                )
            )
        else:
            warnings.append(_NO_BARCODE_COLUMN_WARNING)

    # Event-wide weak-barcode counts, taken before any write: tickets already on the
    # event plus this file's valid rows. A second import still warns.
    short, equal = await _event_barcode_weakness(session, event.id, parsed.rows)
    if dry_run or not clean:
        return PrintixImportReport(
            dry_run=dry_run,
            applied=False,
            rows=parsed.row_count,
            to_add=len(parsed.rows) if clean else 0,
            errors=issues,
            errors_truncated=truncated,
            warnings=warnings,
            short_barcodes=short,
            barcode_equals_number=equal,
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
        short_barcodes=short,
        barcode_equals_number=equal,
    )


async def _event_barcode_weakness(
    session: AsyncSession, event_id: uuid.UUID, rows: list[csv_import.ParsedRow]
) -> tuple[int, int]:
    """Event-wide counts: tickets on the event (short barcodes, barcodes equal to their
    number) plus the file's valid rows. Offline mode is off while either is above zero."""
    short_stored = await session.scalar(
        select(func.count(PrintixTicket.id)).where(
            PrintixTicket.event_id == event_id,
            func.length(PrintixTicket.barcode_value)
            < constants.OFFLINE_MIN_BARCODE_LENGTH,
        )
    )
    equal_stored = await session.scalar(
        select(func.count(PrintixTicket.id)).where(
            PrintixTicket.event_id == event_id,
            PrintixTicket.barcode_value == PrintixTicket.printed_number,
        )
    )
    short_file, equal_file = _barcode_weakness(rows)
    return int(short_stored or 0) + short_file, int(equal_stored or 0) + equal_file


def _barcode_weakness(rows: list[csv_import.ParsedRow]) -> tuple[int, int]:
    """Rows whose barcode is shorter than the offline minimum, and rows whose barcode
    equals the printed number. Either makes offline mode unavailable (rule 7)."""
    short = sum(
        1 for r in rows if len(r.barcode) < constants.OFFLINE_MIN_BARCODE_LENGTH
    )
    equal = sum(1 for r in rows if r.barcode == r.number)
    return short, equal


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
    # One array parameter per column, not one bind per value: a 20,000-row file
    # would otherwise exceed the driver's bind limit.
    values = sorted({row.number for row in rows} | {row.barcode for row in rows})
    values_array = array(values)
    stored = (
        await session.execute(
            select(PrintixTicket.printed_number, PrintixTicket.barcode_value).where(
                PrintixTicket.event_id == event_id,
                or_(
                    PrintixTicket.printed_number == any_(values_array),
                    PrintixTicket.barcode_value == any_(values_array),
                ),
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
    organisation_id: str | None = None,
) -> PrintixTicketPage:
    if organisation_id is not None:
        await get_event(session, event_id, organisation_id=organisation_id)
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


async def _ticket_for(
    session: AsyncSession, ticket_id: uuid.UUID, *, organisation_id: str | None
) -> PrintixTicket:
    """The ticket, or "Ticket not found". With ``organisation_id`` the event's organisation
    is part of the same query, so another organisation's ticket and a missing one answer
    identically."""
    if organisation_id is None:
        ticket = await session.get(PrintixTicket, ticket_id)
    else:
        ticket = await session.scalar(
            select(PrintixTicket)
            .join(PrintixEvent, PrintixEvent.id == PrintixTicket.event_id)
            .where(
                PrintixTicket.id == ticket_id,
                PrintixEvent.organisation_id == organisation_id,
            )
        )
    if ticket is None:
        raise PrintixNotFound("Ticket not found")
    return ticket


async def set_ticket_void(
    session: AsyncSession,
    ticket_id: uuid.UUID,
    *,
    void: bool,
    actor_id: uuid.UUID | None = None,
    organisation_id: str | None = None,
) -> PrintixTicket:
    """Void or restore a ticket. An admitted ticket cannot be voided, and nothing
    changes once the event has closed. ``organisation_id`` (organiser routes) makes a
    ticket of another organisation's event not found."""
    ticket = await _ticket_for(session, ticket_id, organisation_id=organisation_id)
    event = await get_event(session, ticket.event_id, organisation_id=organisation_id)
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
    organisation_id: str | None = None,
) -> tuple[PrintixPairing, str]:
    """A new pairing and its secret. ``expires_at`` is naive UTC or None. The event row
    is locked, so two concurrent makes cannot both pass the active-code cap."""
    event = await _event_for_update(session, event_id, organisation_id=organisation_id)
    now = utc_now()
    if is_closed(event, now):
        raise PrintixConflict("This event is closed, so no new pairings can be made")
    active = await session.scalar(
        select(func.count(PrintixPairing.id)).where(
            PrintixPairing.event_id == event.id,
            PrintixPairing.revoked_at.is_(None),
            PrintixPairing.expires_at > now,
        )
    )
    if int(active or 0) >= constants.MAX_ACTIVE_PAIRINGS_PER_EVENT:
        raise PrintixConflict(
            f"This event already has {constants.MAX_ACTIVE_PAIRINGS_PER_EVENT} active gate "
            "codes. Cancel one before making another."
        )
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
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    organisation_id: str | None = None,
) -> list[PrintixPairing]:
    if organisation_id is not None:
        await get_event(session, event_id, organisation_id=organisation_id)
    rows = await session.scalars(
        select(PrintixPairing)
        .where(PrintixPairing.event_id == event_id)
        .order_by(PrintixPairing.created_at.desc(), PrintixPairing.id)
        .limit(500)
    )
    return list(rows.all())


async def _pairing_for(
    session: AsyncSession, pairing_id: uuid.UUID, *, organisation_id: str | None
) -> PrintixPairing:
    """The pairing, or "Pairing not found"; the organisation filter is in the same query."""
    if organisation_id is None:
        pairing = await session.get(PrintixPairing, pairing_id)
    else:
        pairing = await session.scalar(
            select(PrintixPairing)
            .join(PrintixEvent, PrintixEvent.id == PrintixPairing.event_id)
            .where(
                PrintixPairing.id == pairing_id,
                PrintixEvent.organisation_id == organisation_id,
            )
        )
    if pairing is None:
        raise PrintixNotFound("Pairing not found")
    return pairing


async def revoke_pairing(
    session: AsyncSession,
    pairing_id: uuid.UUID,
    *,
    actor_id: uuid.UUID | None = None,
    organisation_id: str | None = None,
) -> PrintixPairing:
    pairing = await _pairing_for(session, pairing_id, organisation_id=organisation_id)
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
    """True only for the one caller whose conditional UPDATE changed the row.

    ``now`` is the admission time written to the ticket: the server's time for a
    live scan, the phone's (kept in bounds) for an offline one."""
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
    if (
        await _count_scans(
            session, pairing.id, now, PrintixScanLog.offline_scanned_at.is_(None)
        )
        >= constants.SCANS_PER_WINDOW
    ):
        raise _refuse_scan(pairing, "scans")

    value = value.strip()
    may_be_typed = pairing.allow_typed_numbers and bool(_SHORT_NUMBER.fullmatch(value))
    event = await get_event(session, pairing.event_id)
    ticket: PrintixTicket | None = None
    typed = False
    outcome: PrintixScanOutcome
    if is_closed(event, now):
        outcome = PrintixScanOutcome.EVENT_CLOSED
    else:
        ticket = await _barcode_ticket(session, event.id, value)
        if ticket is None and may_be_typed:
            # Only a fall-through to the printed number is a typed attempt, so a
            # valid barcode is never refused by the typed cap.
            if (
                await _count_scans(
                    session, pairing.id, now, PrintixScanLog.typed.is_(True)
                )
                >= constants.TYPED_NUMBER_SCANS_PER_WINDOW
            ):
                raise _refuse_scan(pairing, "typed numbers")
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

    if outcome is PrintixScanOutcome.UNKNOWN and await _unknown_cap_reached(
        session, pairing.id, now
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

    return _scan_result(outcome, ticket)


async def _offline_cap_reached(
    session: AsyncSession,
    pairing_id: uuid.UUID,
    now: datetime,
    outcome: PrintixScanOutcome,
) -> bool:
    """Whether this offline item must be deferred rather than recorded.

    A new admission is never throttled here. Any other answer writes a row, so the
    offline results that are not admissions share one cap per window, and an unknown
    also keeps to the live unknown cap. Counting uses rows written earlier in this
    batch (each one is flushed before the next item).
    """
    if outcome is PrintixScanOutcome.ADMITTED:
        return False
    if outcome is PrintixScanOutcome.UNKNOWN and await _unknown_cap_reached(
        session, pairing_id, now
    ):
        return True
    refusals = await _count_scans(
        session,
        pairing_id,
        now,
        PrintixScanLog.offline_scanned_at.is_not(None),
        PrintixScanLog.outcome != PrintixScanOutcome.ADMITTED.value,
    )
    return refusals >= constants.OFFLINE_NON_ADMISSIONS_PER_WINDOW


def _scan_result(
    outcome: PrintixScanOutcome, ticket: PrintixTicket | None
) -> PrintixScanResult:
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


async def _unknown_cap_reached(
    session: AsyncSession, pairing_id: uuid.UUID, now: datetime
) -> bool:
    """Live and offline unknowns share one cap, so a sync is no faster an oracle."""
    return (
        await _count_scans(
            session,
            pairing_id,
            now,
            PrintixScanLog.outcome == PrintixScanOutcome.UNKNOWN.value,
        )
        >= constants.UNKNOWN_SCANS_PER_WINDOW
    )


# --- Offline scanning -------------------------------------------------------


def offline_hash_key(pairing: PrintixPairing) -> str:
    """The pairing's own key for the offline list's barcode hashes.

    The pairing id is random (uuid4) and not shown to a scanner anywhere else, so
    two pairings' lists cannot be matched against each other or a precomputed
    table. The key is not secret from the phone, which hashes what it scans.
    """
    return pairing.id.hex


def offline_barcode_hash(key: str, value: str) -> str:
    digest = hmac.new(key.encode("utf-8"), value.encode("utf-8"), hashlib.sha256)
    return digest.hexdigest()[: constants.OFFLINE_HASH_HEX_LENGTH]


def _offline_state(
    status: str, admitted_at: datetime | None
) -> PrintixOfflineTicketState:
    if admitted_at is not None:
        return PrintixOfflineTicketState.ADMITTED
    if status == PrintixTicketStatus.VOID.value:
        return PrintixOfflineTicketState.VOID
    return PrintixOfflineTicketState.VALID


async def offline_tickets(
    session: AsyncSession, pairing: PrintixPairing
) -> PrintixOfflineList:
    """The pairing's event and every ticket on it, barcodes replaced by keyed hashes.

    Refused for an event whose barcodes are its printed numbers: their hashes could
    be reversed by trying every number.
    """
    event = await get_event(session, pairing.event_id)
    await _refuse_if_barcodes_are_weak(session, pairing, event)
    generated_at = utc_now()
    key = offline_hash_key(pairing)
    rows = await session.execute(
        select(
            PrintixTicket.barcode_value,
            PrintixTicket.printed_number,
            PrintixTicket.status,
            PrintixTicket.admitted_at,
            PrintixTicket.admitted_gate,
        )
        .where(PrintixTicket.event_id == event.id)
        .order_by(PrintixTicket.printed_number)
    )
    tickets = [
        PrintixOfflineTicket(
            barcode_hash=offline_barcode_hash(key, barcode),
            printed_number=number,
            state=_offline_state(status, admitted_at),
            admitted_at=admitted_at,
            admitted_gate=admitted_gate,
        )
        for barcode, number, status, admitted_at, admitted_gate in rows.all()
    ]
    logger.info(
        "Printix offline list sent: %s tickets",
        len(tickets),
        extra={"subject_id": str(pairing.id), "target_id": str(event.id)},
    )
    return PrintixOfflineList(
        event=event_public(event),
        generated_at=generated_at,
        hash_key=key,
        tickets=tickets,
    )


async def _refuse_if_barcodes_are_weak(
    session: AsyncSession, pairing: PrintixPairing, event: PrintixEvent
) -> None:
    if await _offline_barcodes_too_weak(session, event.id):
        logger.warning(
            "Printix offline mode refused: weak barcodes",
            extra={"subject_id": str(pairing.id), "target_id": str(event.id)},
        )
        raise PrintixOfflineUnavailable()


def _offline_time(
    pairing: PrintixPairing, scanned_at: datetime, now: datetime
) -> datetime:
    """The phone's time, kept between the pairing's creation and now."""
    return min(max(to_naive_utc(scanned_at), pairing.created_at), now)


def _close_instant(event: PrintixEvent) -> datetime:
    """The earlier of the scheduled close and the administrator's close."""
    if event.status == PrintixEventStatus.CLOSED.value and event.closed_at is not None:
        return min(event.closes_at, event.closed_at)
    return event.closes_at


def _offline_refused_as_closed(
    event: PrintixEvent, when: datetime, now: datetime
) -> bool:
    """True when an offline scan is refused as ``event_closed``.

    A scan at or after the close is refused, and a scan before it counts even if it
    syncs after. A closed event with no ``closed_at`` has no known close, so it refuses.
    A sync that arrives more than ``OFFLINE_SYNC_GRACE_AFTER_CLOSE`` after the close
    is refused whatever its scan time, which bounds how far back a queue can reach.
    """
    if event.closes_at <= when:
        return True
    if event.status == PrintixEventStatus.CLOSED.value and (
        event.closed_at is None or event.closed_at <= when
    ):
        return True
    return now > _close_instant(event) + constants.OFFLINE_SYNC_GRACE_AFTER_CLOSE


async def _offline_barcodes_too_weak(
    session: AsyncSession, event_id: uuid.UUID
) -> bool:
    """True when any ticket on the event has a barcode that offline mode cannot protect.

    Two cases, found by a stored-row check (the registry keeps no flag):
    a barcode equal to its printed number (a defaulted barcode, or one typed as the
    number), which is three digits and can be reversed by trying every number; and a
    barcode shorter than ``OFFLINE_MIN_BARCODE_LENGTH``, which can be guessed the same
    way. One such ticket refuses offline mode for the whole event.
    """
    found = await session.scalar(
        select(PrintixTicket.id)
        .where(
            PrintixTicket.event_id == event_id,
            or_(
                PrintixTicket.barcode_value == PrintixTicket.printed_number,
                func.char_length(PrintixTicket.barcode_value)
                < constants.OFFLINE_MIN_BARCODE_LENGTH,
            ),
        )
        .limit(1)
    )
    return found is not None


async def _offline_outcome(
    session: AsyncSession,
    pairing: PrintixPairing,
    event: PrintixEvent,
    value: str,
    when: datetime,
    now: datetime,
) -> tuple[PrintixScanOutcome, PrintixTicket | None]:
    """Barcode only: an offline admission never falls through to a printed number."""
    if _offline_refused_as_closed(event, when, now):
        return PrintixScanOutcome.EVENT_CLOSED, None
    ticket = await _barcode_ticket(session, event.id, value)
    if ticket is None:
        return PrintixScanOutcome.UNKNOWN, None
    if ticket.status == PrintixTicketStatus.VOID.value:
        outcome = PrintixScanOutcome.VOID
    elif await _stamp_if_unadmitted(session, ticket.id, pairing, when):
        outcome = PrintixScanOutcome.ADMITTED
    else:
        outcome = PrintixScanOutcome.ALREADY_ADMITTED
    # Reload: the conditional UPDATE bypassed the session's identity map.
    ticket = await session.get(PrintixTicket, ticket.id, populate_existing=True)
    if ticket is not None and ticket.status == PrintixTicketStatus.VOID.value:
        outcome = PrintixScanOutcome.VOID
    return outcome, ticket


def _offline_result(
    client_ref: uuid.UUID, outcome: PrintixScanOutcome, ticket: PrintixTicket | None
) -> PrintixOfflineAdmissionResult:
    result = _scan_result(outcome, ticket)
    return PrintixOfflineAdmissionResult(
        client_ref=client_ref,
        outcome=result.outcome,
        printed_number=result.printed_number,
        admitted_at=result.admitted_at,
        admitted_gate=result.admitted_gate,
    )


async def _answer_again(
    session: AsyncSession, client_ref: uuid.UUID, row: PrintixScanLog
) -> PrintixOfflineAdmissionResult:
    """A retried reference: the stored outcome, with the ticket as it is now."""
    ticket = (
        await session.get(PrintixTicket, row.ticket_id, populate_existing=True)
        if row.ticket_id is not None
        else None
    )
    return _offline_result(client_ref, PrintixScanOutcome(row.outcome), ticket)


async def _earlier_answers(
    session: AsyncSession, pairing_id: uuid.UUID, refs: list[uuid.UUID]
) -> dict[uuid.UUID, PrintixScanLog]:
    rows = await session.scalars(
        select(PrintixScanLog).where(
            PrintixScanLog.pairing_id == pairing_id,
            PrintixScanLog.client_ref.in_(refs),
        )
    )
    return {row.client_ref: row for row in rows.all() if row.client_ref is not None}


async def sync_offline_admissions(
    session: AsyncSession,
    pairing: PrintixPairing,
    admissions: list[PrintixOfflineAdmission],
) -> PrintixOfflineSyncResult:
    """Record admissions a phone made offline. The server stays the source of truth.

    Each is checked like a live scan, by barcode only, at the phone's time kept in
    bounds. The first admission the server records wins; any other answer is a
    conflict for the phone to show. Offline rows do not count against the live
    scan cap, but unknowns share the live unknown cap: past it, the rest of the
    batch is deferred, unanswered and unlogged. One transaction, under the
    pairing's lock, so a retried reference is answered from its first row.
    """
    now = utc_now()
    await _lock_pairing(session, pairing.id)
    event = await get_event(session, pairing.event_id)
    await _refuse_if_barcodes_are_weak(session, pairing, event)
    earlier = await _earlier_answers(
        session, pairing.id, [admission.client_ref for admission in admissions]
    )
    results: list[PrintixOfflineAdmissionResult] = []
    deferred = 0
    for index, admission in enumerate(admissions):
        prior = earlier.get(admission.client_ref)
        if prior is not None:
            results.append(await _answer_again(session, admission.client_ref, prior))
            continue
        when = _offline_time(pairing, admission.scanned_at, now)
        value = admission.value.strip()
        outcome, ticket = await _offline_outcome(
            session, pairing, event, value, when, now
        )
        if await _offline_cap_reached(session, pairing.id, now, outcome):
            deferred = len(admissions) - index
            break
        session.add(
            PrintixScanLog(
                id=uuid.uuid4(),
                pairing_id=pairing.id,
                ticket_id=ticket.id if ticket is not None else None,
                outcome=outcome.value,
                value=value[: constants.SCAN_VALUE_LOG_LENGTH],
                typed=False,
                scanned_at=now,
                offline_scanned_at=when,
                client_ref=admission.client_ref,
            )
        )
        await session.flush()
        results.append(_offline_result(admission.client_ref, outcome, ticket))
    await session.commit()
    logger.info(
        "Printix offline sync: %s handled, %s deferred",
        len(results),
        deferred,
        extra={"subject_id": str(pairing.id), "target_id": str(event.id)},
    )
    return PrintixOfflineSyncResult(
        results=results,
        deferred=deferred,
        retry_after_seconds=constants.SCAN_WINDOW_SECONDS if deferred else None,
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
