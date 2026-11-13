"""Terminal punch import (ADR-0040, Decision 4).

A fingerprint or fob terminal's export is read by ``terminal_parser`` and stored in
``hr.terminal_punch`` once per device, terminal and punch time, so a re-run imports
nothing twice. Each new punch is then decided, in time order, for its person:

1. no mapping for the device ID                 -> UNMAPPED (held for HR)
2. a scan within REPEAT_WINDOW of the last accepted punch -> REPEAT (ignored)
3. the shift already has this arrival or departure (close in time, e.g. an approved
   phone punch)                                 -> ALREADY_RECORDED
4. an open shift (arrival recorded, no departure) -> its departure
5. otherwise an arrival, matched to a published work shift by the phone clock-in
   window rule                                   -> RECORDED, or NO_SHIFT (held)

Writes go through ``save_attendance`` as the employee, the path phone-punch approval
uses, so roster checks, revisions and audit are the same journey. A refusal records
REFUSED with its message and the import carries on.

``save_attendance`` commits its own transaction, so each punch is decided in its own
transaction: a refusal rolls back only that punch's attendance write, which is the
per-row isolation a savepoint would give. Nothing here stores biometric data.
"""

import logging
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.audit import service as audit_service
from src.auth.models import Role, User
from src.auth.policy import require_permission
from src.exceptions import AppException
from src.hr.models import EmploymentRecord
from src.hr.roster.service import require_roster_manage_scope
from src.utils.timezones import GRENADA, local_to_utc

from . import clock_service, terminal_parser
from .models import (
    AttendanceRecord,
    ClockPunchKind,
    TerminalAttentionOutcome,
    TerminalPunch,
    TerminalPunchOutcome,
    TerminalUser,
)
from .schemas import AttendanceSave
from .service import save_attendance

logger = logging.getLogger(__name__)

MAX_IMPORT_BYTES = 1024 * 1024
MAX_IMPORT_LINES = 5000
REPEAT_MINUTES = 5
REPEAT_WINDOW = timedelta(minutes=REPEAT_MINUTES)
#: A recorded time this close to a scan is the same arrival or departure.
SAME_EVENT_WINDOW = timedelta(minutes=15)
#: An open arrival older than this is not closed by a later scan (as clock-in).
OPEN_SHIFT_WINDOW = timedelta(hours=24)

PENDING = TerminalPunchOutcome.PENDING
UNMAPPED = TerminalPunchOutcome.UNMAPPED
REPEAT = TerminalPunchOutcome.REPEAT
RECORDED = TerminalPunchOutcome.RECORDED
ALREADY_RECORDED = TerminalPunchOutcome.ALREADY_RECORDED
NO_SHIFT = TerminalPunchOutcome.NO_SHIFT
REFUSED = TerminalPunchOutcome.REFUSED

#: Outcomes that do not count as an accepted scan when judging a repeat.
_NOT_ACCEPTED = (PENDING.value, UNMAPPED.value, REPEAT.value)
#: Outcomes an HR re-run may decide again (after a mapping or roster change).
_REPROCESSABLE = (PENDING.value, UNMAPPED.value, NO_SHIFT.value)
_ATTENTION = tuple(member.value for member in TerminalAttentionOutcome)


@dataclass(frozen=True)
class MappingRow:
    mapping: TerminalUser
    employee_name: str


@dataclass(frozen=True)
class PunchRow:
    punch: TerminalPunch
    employee_name: str | None


@dataclass(frozen=True)
class ImportSummary:
    import_id: uuid.UUID
    new_punches: int
    duplicates: int
    errors: list[terminal_parser.LineError]
    outcomes: Counter[TerminalPunchOutcome]
    rows: list[PunchRow] = field(default_factory=list)


@dataclass(frozen=True)
class ReprocessSummary:
    processed: int
    outcomes: Counter[TerminalPunchOutcome]


@dataclass(frozen=True)
class _Verdict:
    outcome: TerminalPunchOutcome
    user_id: uuid.UUID | None = None
    roster_assignment_id: uuid.UUID | None = None
    kind: str | None = None
    detail: str | None = None


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


def _name(first: str | None, last: str | None) -> str | None:
    if first is None:
        return None
    return f"{first} {last or ''}".strip()


def _local_midnight(day: date) -> datetime:
    return local_to_utc(day, time(0), GRENADA)


async def _require_roster_manage(
    session: AsyncSession, current_user: User, department_id: str
) -> None:
    require_permission(current_user=current_user, permission_key="roster.manage")
    await require_roster_manage_scope(session, current_user, department_id)


async def list_mappings(
    *, session: AsyncSession, current_user: User, department_id: str
) -> list[MappingRow]:
    await _require_roster_manage(session, current_user, department_id)
    rows = (
        await session.execute(
            select(TerminalUser, User.first_name, User.last_name)
            .join(User, User.id == TerminalUser.user_id)
            .where(TerminalUser.department_id == department_id)
            .order_by(TerminalUser.device_user_id)
        )
    ).all()
    return [
        MappingRow(mapping=mapping, employee_name=_name(first, last) or "")
        for mapping, first, last in rows
    ]


async def add_mapping(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    device_user_id: str,
    user_id: uuid.UUID,
) -> MappingRow:
    await _require_roster_manage(session, current_user, department_id)
    employed = await session.scalar(
        select(EmploymentRecord.user_id).where(
            EmploymentRecord.user_id == user_id,
            EmploymentRecord.department_id == department_id,
        )
    )
    if employed is None:
        raise AppException("Employee does not belong to this department", 400)
    taken_message = "This device ID or employee is already mapped in this department"
    taken = await session.scalar(
        select(TerminalUser.id).where(
            TerminalUser.department_id == department_id,
            or_(
                TerminalUser.device_user_id == device_user_id,
                TerminalUser.user_id == user_id,
            ),
        )
    )
    if taken is not None:
        raise AppException(taken_message, 409)
    audit_service.set_actor(session, current_user.id)
    mapping = TerminalUser(
        id=uuid.uuid4(),
        department_id=department_id,
        device_user_id=device_user_id,
        user_id=user_id,
        created_by_user_id=current_user.id,
    )
    session.add(mapping)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppException(taken_message, 409) from None
    person = await session.get(User, user_id)
    name = _name(person.first_name, person.last_name) if person else None
    return MappingRow(mapping=mapping, employee_name=name or "")


async def remove_mapping(
    *, session: AsyncSession, current_user: User, terminal_user_id: uuid.UUID
) -> None:
    """Remove a device mapping. Punches already decided keep their outcome."""
    mapping = await session.get(TerminalUser, terminal_user_id)
    if mapping is None:
        raise AppException("Terminal user mapping not found", 404)
    await _require_roster_manage(session, current_user, mapping.department_id)
    audit_service.set_actor(session, current_user.id)
    await session.delete(mapping)
    await session.commit()


async def import_export(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    terminal: str,
    content: bytes,
) -> ImportSummary:
    await _require_roster_manage(session, current_user, department_id)
    if len(content) > MAX_IMPORT_BYTES:
        raise AppException("Export file is larger than 1 MiB", 413)
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AppException("Export file must be UTF-8 text", 400) from None
    parsed = terminal_parser.parse_export(text)
    if not parsed.punches and not parsed.errors:
        raise AppException("The file has no punch lines", 400)
    if len(parsed.punches) + len(parsed.errors) > MAX_IMPORT_LINES:
        raise AppException(
            f"Export has more than {MAX_IMPORT_LINES} lines; split it and import again",
            400,
        )

    audit_service.set_actor(session, current_user.id)
    import_id = uuid.uuid4()
    existing = await _existing_scans(session, department_id, terminal, parsed.punches)
    fresh: list[TerminalPunch] = []
    seen: set[tuple[str, datetime]] = set()
    duplicates = 0
    for punch in sorted(parsed.punches, key=lambda p: (p.punched_at, p.device_user_id)):
        key = (punch.device_user_id, punch.punched_at)
        if key in existing or key in seen:
            duplicates += 1
            continue
        seen.add(key)
        fresh.append(
            TerminalPunch(
                id=uuid.uuid4(),
                department_id=department_id,
                terminal=terminal,
                device_user_id=punch.device_user_id,
                punched_at=punch.punched_at,
                outcome=PENDING.value,
                import_id=import_id,
            )
        )
    fresh_ids = [row.id for row in fresh]
    session.add_all(fresh)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppException(
            "Another import of these punches is running; try again", 409
        ) from None

    outcomes: Counter[TerminalPunchOutcome] = Counter()
    for punch_id in fresh_ids:
        outcomes[await _decide(session, punch_id)] += 1
    rows = await _punch_rows(
        session,
        [TerminalPunch.import_id == import_id],
        limit=MAX_IMPORT_LINES,
        offset=0,
    )
    logger.info(
        "Terminal punches imported",
        extra={
            "import_id": str(import_id),
            "new_punches": len(fresh_ids),
            "duplicates": duplicates,
        },
    )
    return ImportSummary(
        import_id=import_id,
        new_punches=len(fresh_ids),
        duplicates=duplicates,
        errors=parsed.errors,
        outcomes=outcomes,
        rows=rows,
    )


async def _existing_scans(
    session: AsyncSession,
    department_id: str,
    terminal: str,
    punches: list[terminal_parser.ParsedPunch],
) -> set[tuple[str, datetime]]:
    if not punches:
        return set()
    low = min(p.punched_at for p in punches)
    high = max(p.punched_at for p in punches)
    rows = await session.execute(
        select(TerminalPunch.device_user_id, TerminalPunch.punched_at).where(
            TerminalPunch.department_id == department_id,
            TerminalPunch.terminal == terminal,
            TerminalPunch.punched_at.between(low, high),
        )
    )
    return {(device, at) for device, at in rows.all()}


async def reprocess(
    *, session: AsyncSession, current_user: User, department_id: str
) -> ReprocessSummary:
    """Decide again the held punches of a department (after mappings or rosters change)."""
    await _require_roster_manage(session, current_user, department_id)
    audit_service.set_actor(session, current_user.id)
    ids = (
        await session.scalars(
            select(TerminalPunch.id)
            .where(
                TerminalPunch.department_id == department_id,
                TerminalPunch.outcome.in_(_REPROCESSABLE),
            )
            .order_by(TerminalPunch.punched_at, TerminalPunch.id)
        )
    ).all()
    outcomes: Counter[TerminalPunchOutcome] = Counter()
    for punch_id in ids:
        outcomes[await _decide(session, punch_id)] += 1
    return ReprocessSummary(processed=len(ids), outcomes=outcomes)


async def _decide(session: AsyncSession, punch_id: uuid.UUID) -> TerminalPunchOutcome:
    punch = await session.get(TerminalPunch, punch_id, populate_existing=True)
    if punch is None:
        raise AppException("Terminal punch not found", 404)
    department_id = punch.department_id
    device_user_id = punch.device_user_id
    punched_at = punch.punched_at
    try:
        verdict = await _verdict(session, department_id, device_user_id, punched_at)
    except AppException as error:
        # save_attendance commits only on success, so this rolls back one punch.
        await session.rollback()
        verdict = _Verdict(
            REFUSED,
            user_id=await _mapped_user(session, department_id, device_user_id),
            detail=error.message,
        )
    punch = await session.get(TerminalPunch, punch_id, populate_existing=True)
    if punch is None:
        raise AppException("Terminal punch not found", 404)
    punch.outcome = verdict.outcome.value
    punch.user_id = verdict.user_id
    punch.roster_assignment_id = verdict.roster_assignment_id
    punch.kind = verdict.kind
    punch.detail = verdict.detail[:255] if verdict.detail else None
    await session.commit()
    return verdict.outcome


async def _mapped_user(
    session: AsyncSession, department_id: str, device_user_id: str
) -> uuid.UUID | None:
    mapped: uuid.UUID | None = await session.scalar(
        select(TerminalUser.user_id).where(
            TerminalUser.department_id == department_id,
            TerminalUser.device_user_id == device_user_id,
        )
    )
    return mapped


async def _verdict(
    session: AsyncSession,
    department_id: str,
    device_user_id: str,
    punched_at: datetime,
) -> _Verdict:
    user_id = await _mapped_user(session, department_id, device_user_id)
    if user_id is None:
        return _Verdict(UNMAPPED, detail="No employee is mapped to this device ID")
    if await _is_repeat(session, department_id, device_user_id, punched_at):
        return _Verdict(
            REPEAT,
            user_id=user_id,
            detail=f"Scan within {REPEAT_MINUTES} minutes of the previous punch",
        )
    recorded = await _recorded_near(session, user_id, punched_at)
    if recorded is not None:
        return _Verdict(
            ALREADY_RECORDED,
            user_id=user_id,
            roster_assignment_id=recorded.roster_assignment_id,
            kind=recorded.kind,
            detail="Already recorded, close in time to a phone or earlier punch",
        )
    open_record = await _open_record(session, user_id, punched_at)
    if open_record is not None:
        return await _write_departure(session, user_id, open_record, punched_at)
    return await _write_arrival(session, department_id, user_id, punched_at)


async def _is_repeat(
    session: AsyncSession, department_id: str, device_user_id: str, punched_at: datetime
) -> bool:
    previous = await session.scalar(
        select(TerminalPunch.punched_at)
        .where(
            TerminalPunch.department_id == department_id,
            TerminalPunch.device_user_id == device_user_id,
            TerminalPunch.punched_at < punched_at,
            ~TerminalPunch.outcome.in_(_NOT_ACCEPTED),
        )
        .order_by(TerminalPunch.punched_at.desc())
        .limit(1)
    )
    return previous is not None and punched_at - previous <= REPEAT_WINDOW


@dataclass(frozen=True)
class _RecordedNear:
    roster_assignment_id: uuid.UUID
    kind: str


async def _recorded_near(
    session: AsyncSession, user_id: uuid.UUID, punched_at: datetime
) -> _RecordedNear | None:
    low, high = punched_at - SAME_EVENT_WINDOW, punched_at + SAME_EVENT_WINDOW
    records = (
        await session.scalars(
            select(AttendanceRecord).where(
                AttendanceRecord.user_id == user_id,
                or_(
                    AttendanceRecord.arrived_at.between(low, high),
                    AttendanceRecord.departed_at.between(low, high),
                ),
            )
        )
    ).all()
    for record in records:
        if record.departed_at is not None and low <= record.departed_at <= high:
            return _RecordedNear(
                record.roster_assignment_id, ClockPunchKind.DEPART.value
            )
        if low <= record.arrived_at <= high:
            return _RecordedNear(
                record.roster_assignment_id, ClockPunchKind.ARRIVE.value
            )
    return None


async def _open_record(
    session: AsyncSession, user_id: uuid.UUID, punched_at: datetime
) -> AttendanceRecord | None:
    record: AttendanceRecord | None = await session.scalar(
        select(AttendanceRecord)
        .where(
            AttendanceRecord.user_id == user_id,
            AttendanceRecord.departed_at.is_(None),
            AttendanceRecord.arrived_at <= punched_at,
            AttendanceRecord.arrived_at >= punched_at - OPEN_SHIFT_WINDOW,
        )
        .order_by(AttendanceRecord.arrived_at.desc())
        .limit(1)
    )
    return record


async def _employee(session: AsyncSession, user_id: uuid.UUID) -> User:
    """The employee, with roles and permissions loaded: save_attendance checks the
    employee's own timesheet.submit.self, and a lazy load would fail in async."""
    employee = (
        (
            await session.execute(
                select(User)
                .where(User.id == user_id)
                .options(selectinload(User.roles).selectinload(Role.permissions))
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .first()
    )
    if employee is None:
        raise AppException("Employee not found", 404)
    return employee


async def _write_departure(
    session: AsyncSession,
    user_id: uuid.UUID,
    record: AttendanceRecord,
    punched_at: datetime,
) -> _Verdict:
    roster_assignment_id = record.roster_assignment_id
    payload = AttendanceSave(
        roster_assignment_id=roster_assignment_id,
        expected_revision=record.revision,
        arrived_at=_aware(record.arrived_at),
        departed_at=_aware(punched_at),
        break_minutes=record.break_minutes,
        notes=record.notes,
    )
    await save_attendance(
        session=session, current_user=await _employee(session, user_id), payload=payload
    )
    return _Verdict(
        RECORDED,
        user_id=user_id,
        roster_assignment_id=roster_assignment_id,
        kind=ClockPunchKind.DEPART.value,
    )


async def _write_arrival(
    session: AsyncSession, department_id: str, user_id: uuid.UUID, punched_at: datetime
) -> _Verdict:
    found = await clock_service._current_assignment(
        session, user_id, punched_at, department_id
    )
    if found is None:
        return _Verdict(
            NO_SHIFT,
            user_id=user_id,
            kind=ClockPunchKind.ARRIVE.value,
            detail="No published work shift in this department matches this punch",
        )
    assignment, _ = found
    assignment_id = assignment.id
    payload = AttendanceSave(
        roster_assignment_id=assignment_id,
        expected_revision=0,
        arrived_at=_aware(punched_at),
    )
    await save_attendance(
        session=session, current_user=await _employee(session, user_id), payload=payload
    )
    return _Verdict(
        RECORDED,
        user_id=user_id,
        roster_assignment_id=assignment_id,
        kind=ClockPunchKind.ARRIVE.value,
    )


async def list_punches(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    outcome: TerminalPunchOutcome | None,
    terminal: str | None,
    from_date: date | None,
    to_date: date | None,
    limit: int,
    offset: int,
) -> tuple[list[PunchRow], int]:
    """Punches a department's HR must look at by default (UNMAPPED, NO_SHIFT,
    REFUSED), or those with one outcome. Filtering and paging run in SQL."""
    await _require_roster_manage(session, current_user, department_id)
    if from_date and to_date and from_date > to_date:
        raise AppException("from_date must be on or before to_date", 400)
    conditions = [TerminalPunch.department_id == department_id]
    if outcome is None:
        conditions.append(TerminalPunch.outcome.in_(_ATTENTION))
    else:
        conditions.append(TerminalPunch.outcome == outcome.value)
    if terminal:
        conditions.append(TerminalPunch.terminal == terminal)
    if from_date:
        conditions.append(TerminalPunch.punched_at >= _local_midnight(from_date))
    if to_date:
        conditions.append(
            TerminalPunch.punched_at < _local_midnight(to_date + timedelta(days=1))
        )
    total = await session.scalar(
        select(func.count()).select_from(TerminalPunch).where(*conditions)
    )
    rows = await _punch_rows(session, conditions, limit=limit, offset=offset)
    return rows, int(total or 0)


async def _punch_rows(
    session: AsyncSession,
    conditions: list[ColumnElement[bool]],
    *,
    limit: int,
    offset: int,
) -> list[PunchRow]:
    rows = (
        await session.execute(
            select(TerminalPunch, User.first_name, User.last_name)
            .outerjoin(User, User.id == TerminalPunch.user_id)
            .where(*conditions)
            .order_by(TerminalPunch.punched_at, TerminalPunch.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [
        PunchRow(punch=punch, employee_name=_name(first, last))
        for punch, first, last in rows
    ]
