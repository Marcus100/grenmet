"""Terminal punch import (ADR-0040, Decision 4).

A fingerprint or fob terminal's export is read by ``terminal_parser`` and stored in
``hr.terminal_punch`` once per device, terminal and punch time, so a re-run imports
nothing twice. Each new punch is decided in time order for its person:

1. no mapping for the device ID                          -> UNMAPPED (held for HR)
2. a scan within REPEAT_WINDOW of the last accepted scan  -> REPEAT (ignored)
3. an open shift (arrival recorded, no departure) and the scan is before the
   midpoint between that shift's end and the next rostered shift's start (any scan
   when there is no next shift)                           -> its departure
4. a recorded arrival or departure within SAME_EVENT_WINDOW, and the normal decision
   would find no shift for the scan                       -> ALREADY_RECORDED
5. otherwise an arrival: a published work shift matched by the phone clock-in window,
   the scan not nearer that shift's end than its start, and no earlier punch of the
   same device still undecided within 24 hours           -> RECORDED, else NO_SHIFT

Writes go through ``save_attendance`` as the employee, the path phone-punch approval
uses. Before any write the HR actor must hold ``timesheet.submit.proxy`` and pass
``can_act_on_user`` for the employee; otherwise the punch is REFUSED and nothing is
written. A refusal records REFUSED with its message and the import carries on.

``save_attendance`` commits its own transaction, so each punch is decided in its own
transaction. A refusal rolls back only that punch's attendance write. A punch row is
locked with SKIP LOCKED while it is decided, and its outcome is checked again under
the lock, so two runs never decide the same row. The lock is released when
save_attendance commits; the attendance write is serialised by save_attendance's own
row locks, so a second run sees the record already written (ALREADY_RECORDED).

Nothing here stores biometric data.
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
from src.auth.policy import can_act_on_user, require_permission
from src.exceptions import AppException, AuthorizationError
from src.hr.models import EmploymentRecord, live_employment_clause
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.roster.service import require_roster_manage_scope
from src.utils.timezones import GRENADA, local_to_utc, local_today

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
from .service import save_attendance, scheduled_bounds

logger = logging.getLogger(__name__)

MAX_IMPORT_BYTES = 1024 * 1024
MAX_IMPORT_LINES = 1000
MAX_REPROCESS_ROWS = 1000
REPEAT_MINUTES = 5
REPEAT_WINDOW = timedelta(minutes=REPEAT_MINUTES)
#: A recorded time this close to a scan is the same arrival or departure.
SAME_EVENT_WINDOW = timedelta(minutes=15)
#: An open arrival older than this is not closed by a later scan (as clock-in).
OPEN_SHIFT_WINDOW = timedelta(hours=24)
#: An earlier undecided punch of the same device within this holds a later arrival.
EARLIER_HOLD_WINDOW = timedelta(hours=24)
PROXY_PERMISSION = "timesheet.submit.proxy"
DENIED = "Not allowed to record this employee's attendance"
MARKER_PREFIX = "Terminal import: "
NOTES_MAX = 500
UNDECIDED_DETAIL = "an earlier punch is not decided yet"
ALREADY_DETAIL = "Already recorded, close in time to a phone or earlier punch"
NO_SHIFT_DETAIL = "No published work shift in this department matches this punch"
NEAR_END_DETAIL = (
    "Scan is nearer the end of the shift than its start; not taken as an arrival"
)

PENDING = TerminalPunchOutcome.PENDING
UNMAPPED = TerminalPunchOutcome.UNMAPPED
REPEAT = TerminalPunchOutcome.REPEAT
RECORDED = TerminalPunchOutcome.RECORDED
ALREADY_RECORDED = TerminalPunchOutcome.ALREADY_RECORDED
NO_SHIFT = TerminalPunchOutcome.NO_SHIFT
REFUSED = TerminalPunchOutcome.REFUSED

#: Outcomes that do not count as an accepted scan when judging a repeat.
_NOT_ACCEPTED = (PENDING.value, UNMAPPED.value, REPEAT.value)
#: Outcomes that hold a later arrival of the same device until they are decided.
_HOLDING = (PENDING.value, UNMAPPED.value, NO_SHIFT.value)
#: Outcomes a run may decide. A REFUSED punch is fixable (for example by granting proxy
#: rights), so it is decided again.
_DECIDABLE = (PENDING.value, UNMAPPED.value, NO_SHIFT.value, REFUSED.value)
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
    #: Attention rows (UNMAPPED, NO_SHIFT, REFUSED) of this upload only.
    rows: list[PunchRow] = field(default_factory=list)


@dataclass(frozen=True)
class ReprocessSummary:
    processed: int
    outcomes: Counter[TerminalPunchOutcome]
    #: Candidate rows this call did not reach because of the per-call cap.
    remaining: int


@dataclass(frozen=True)
class _Verdict:
    outcome: TerminalPunchOutcome
    user_id: uuid.UUID | None = None
    roster_assignment_id: uuid.UUID | None = None
    kind: str | None = None
    detail: str | None = None


@dataclass(frozen=True)
class _Near:
    roster_assignment_id: uuid.UUID
    kind: str


def normalise_terminal(label: str) -> str:
    """The terminal label as stored and as part of the dedupe key: trimmed, lower case."""
    key = label.strip().lower()
    if not key:
        raise AppException("Terminal label is required", 400)
    return key


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


def _name(first: str | None, last: str | None) -> str | None:
    if first is None:
        return None
    return f"{first} {last or ''}".strip()


def _local_midnight(day: date) -> datetime:
    return local_to_utc(day, time(0), GRENADA)


def _within(a: datetime, b: datetime) -> bool:
    return abs(a - b) <= SAME_EVENT_WINDOW


def _with_marker(existing: str | None, marker: str) -> str:
    """Append the import marker to the employee's notes without overwriting them."""
    if not existing:
        return marker[:NOTES_MAX]
    if marker in existing:
        return existing
    room = NOTES_MAX - len(marker) - 3
    if room <= 0:
        return marker[:NOTES_MAX]
    return f"{existing[:room]} | {marker}"


async def _require_roster_manage(
    session: AsyncSession, current_user: User, department_id: str
) -> None:
    require_permission(current_user=current_user, permission_key="roster.manage")
    await require_roster_manage_scope(session, current_user, department_id)


async def _load_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    """A user with roles and permissions loaded: permission checks run on them, and a
    lazy load would fail in async code."""
    user = (
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
    if user is None:
        raise AppException("User not found", 404)
    return user


async def _require_proxy(
    session: AsyncSession, actor_id: uuid.UUID, employee_id: uuid.UUID
) -> None:
    """The HR actor may record attendance for this employee: timesheet.submit.proxy
    within their scope. Without it nothing is written for the employee."""
    actor = await _load_user(session, actor_id)
    try:
        require_permission(current_user=actor, permission_key=PROXY_PERMISSION)
    except AuthorizationError:
        raise AppException(DENIED, 403) from None
    allowed = await can_act_on_user(
        session=session,
        current_user=actor,
        target_user_id=employee_id,
        permission_key=PROXY_PERMISSION,
    )
    if not allowed:
        raise AppException(DENIED, 403)


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
    live = await session.scalar(
        select(EmploymentRecord.user_id).where(
            EmploymentRecord.user_id == user_id,
            EmploymentRecord.department_id == department_id,
            live_employment_clause(local_today()),
        )
    )
    if live is None:
        raise AppException(
            "This employee's employment in the department has ended", 400
        )
    await _require_proxy(session, current_user.id, user_id)
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
    """Remove a device mapping. Punches already decided keep their outcome.

    A mapping outside the caller's scope answers exactly like a missing one, so the
    response never reveals that the ID exists."""
    require_permission(current_user=current_user, permission_key="roster.manage")
    mapping = await session.get(TerminalUser, terminal_user_id)
    if mapping is not None:
        try:
            await require_roster_manage_scope(
                session, current_user, mapping.department_id
            )
        except AppException as error:
            if error.status_code not in (401, 403):
                raise
            mapping = None
    if mapping is None:
        raise AppException("Terminal user mapping not found", 404)
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
    terminal_key = normalise_terminal(terminal)
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

    actor_id = current_user.id
    audit_service.set_actor(session, actor_id)
    import_id = uuid.uuid4()
    existing = await _existing_scans(
        session, department_id, terminal_key, parsed.punches
    )
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
                terminal=terminal_key,
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
        outcome = await _decide(session, punch_id, actor_id)
        if outcome is not None:
            outcomes[outcome] += 1
    rows = await _punch_rows(
        session,
        [TerminalPunch.import_id == import_id, TerminalPunch.outcome.in_(_ATTENTION)],
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
    """Decide again a department's held and refused punches, oldest first, at most
    MAX_REPROCESS_ROWS per call. ``remaining`` counts the candidates this call did not
    reach. Punches that stay held are candidates again on the next call, so a caller
    stops when ``remaining`` is 0 or when a call changes nothing."""
    await _require_roster_manage(session, current_user, department_id)
    actor_id = current_user.id
    audit_service.set_actor(session, actor_id)
    candidates: list[ColumnElement[bool]] = [
        TerminalPunch.department_id == department_id,
        TerminalPunch.outcome.in_(_DECIDABLE),
    ]
    total = await session.scalar(
        select(func.count()).select_from(TerminalPunch).where(*candidates)
    )
    ids = (
        await session.scalars(
            select(TerminalPunch.id)
            .where(*candidates)
            .order_by(TerminalPunch.punched_at, TerminalPunch.id)
            .limit(MAX_REPROCESS_ROWS)
        )
    ).all()
    outcomes: Counter[TerminalPunchOutcome] = Counter()
    processed = 0
    for punch_id in ids:
        outcome = await _decide(session, punch_id, actor_id)
        if outcome is not None:
            outcomes[outcome] += 1
            processed += 1
    return ReprocessSummary(
        processed=processed,
        outcomes=outcomes,
        remaining=max(0, int(total or 0) - len(ids)),
    )


async def _decide(
    session: AsyncSession, punch_id: uuid.UUID, actor_id: uuid.UUID
) -> TerminalPunchOutcome | None:
    """Decide one punch. Returns None when another run holds the row, or it is decided."""
    locked = await session.scalar(
        select(TerminalPunch)
        .where(TerminalPunch.id == punch_id)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    if locked is None or locked.outcome not in _DECIDABLE:
        return None
    department_id = locked.department_id
    device_user_id = locked.device_user_id
    punched_at = locked.punched_at
    marker = f"{MARKER_PREFIX}{locked.terminal}"
    try:
        verdict = await _verdict(
            session, actor_id, department_id, device_user_id, punched_at, marker
        )
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
    actor_id: uuid.UUID,
    department_id: str,
    device_user_id: str,
    punched_at: datetime,
    marker: str,
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
    open_record = await _open_record(session, user_id, punched_at)
    if open_record is not None:
        if _within(open_record.arrived_at, punched_at):
            return _Verdict(
                ALREADY_RECORDED,
                user_id=user_id,
                roster_assignment_id=open_record.roster_assignment_id,
                kind=ClockPunchKind.ARRIVE.value,
                detail=ALREADY_DETAIL,
            )
        if await _closes_open_shift(session, user_id, open_record, punched_at):
            return await _write_departure(
                session, actor_id, user_id, open_record, punched_at, marker
            )
    near = await _closed_near(session, user_id, punched_at)
    if near is not None:
        # A duplicate only when the normal decision would find no shift for this scan.
        target = await clock_service.current_assignment(
            session, user_id, punched_at, department_id
        )
        if target is None:
            return _Verdict(
                ALREADY_RECORDED,
                user_id=user_id,
                roster_assignment_id=near.roster_assignment_id,
                kind=near.kind,
                detail=ALREADY_DETAIL,
            )
    return await _write_arrival(
        session, actor_id, department_id, user_id, device_user_id, punched_at, marker
    )


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


async def _assignment_and_shift(
    session: AsyncSession, assignment_id: uuid.UUID
) -> tuple[RosterAssignment, ShiftCatalog]:
    row = (
        await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(RosterAssignment.id == assignment_id)
        )
    ).one()
    return row[0], row[1]


async def _next_shift_start(
    session: AsyncSession, user_id: uuid.UUID, after: datetime
) -> datetime | None:
    """Start of the person's next published work shift that begins after ``after``."""
    day = _aware(after).astimezone(GRENADA).date()
    rows = (
        await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(
                RosterAssignment.user_id == user_id,
                RosterAssignment.assignment_date >= day - timedelta(days=1),
                RosterAssignment.assignment_date <= day + timedelta(days=2),
                RosterPeriod.status == RosterPeriodStatus.PUBLISHED,
                ShiftCatalog.category == ShiftCategory.WORK,
            )
        )
    ).all()
    starts = [scheduled_bounds(assignment, shift)[0] for assignment, shift in rows]
    later = [start for start in starts if start > after]
    return min(later) if later else None


async def _closes_open_shift(
    session: AsyncSession,
    user_id: uuid.UUID,
    record: AttendanceRecord,
    punched_at: datetime,
) -> bool:
    """True when the scan is the departure of the open shift: before the midpoint between
    that shift's scheduled end and the next rostered shift's start. With no next shift
    any scan closes it. A scan at or after the midpoint is an arrival, and the open
    record stays open for HR. (Midpoint rather than "nearer the end": a seamless handover
    has end == next start, so a nearest-end test is a tie for every scan.)"""
    assignment, shift = await _assignment_and_shift(
        session, record.roster_assignment_id
    )
    start, end = scheduled_bounds(assignment, shift)
    next_start = await _next_shift_start(session, user_id, start)
    if next_start is None:
        return True
    return punched_at - end < next_start - punched_at


async def _closed_near(
    session: AsyncSession, user_id: uuid.UUID, punched_at: datetime
) -> _Near | None:
    low, high = punched_at - SAME_EVENT_WINDOW, punched_at + SAME_EVENT_WINDOW
    records = (
        await session.scalars(
            select(AttendanceRecord).where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.departed_at.is_not(None),
                or_(
                    AttendanceRecord.arrived_at.between(low, high),
                    AttendanceRecord.departed_at.between(low, high),
                ),
            )
        )
    ).all()
    for record in records:
        if record.departed_at is not None and low <= record.departed_at <= high:
            return _Near(record.roster_assignment_id, ClockPunchKind.DEPART.value)
        if low <= record.arrived_at <= high:
            return _Near(record.roster_assignment_id, ClockPunchKind.ARRIVE.value)
    return None


async def _earlier_undecided(
    session: AsyncSession, department_id: str, device_user_id: str, punched_at: datetime
) -> bool:
    found = await session.scalar(
        select(TerminalPunch.id)
        .where(
            TerminalPunch.department_id == department_id,
            TerminalPunch.device_user_id == device_user_id,
            TerminalPunch.punched_at < punched_at,
            TerminalPunch.punched_at >= punched_at - EARLIER_HOLD_WINDOW,
            TerminalPunch.outcome.in_(_HOLDING),
        )
        .limit(1)
    )
    return found is not None


async def _write_departure(
    session: AsyncSession,
    actor_id: uuid.UUID,
    user_id: uuid.UUID,
    record: AttendanceRecord,
    punched_at: datetime,
    marker: str,
) -> _Verdict:
    roster_assignment_id = record.roster_assignment_id
    arrived_at = record.arrived_at
    revision = record.revision
    break_minutes = record.break_minutes
    notes = _with_marker(record.notes, marker)
    await _require_proxy(session, actor_id, user_id)
    await save_attendance(
        session=session,
        current_user=await _load_user(session, user_id),
        payload=AttendanceSave(
            roster_assignment_id=roster_assignment_id,
            expected_revision=revision,
            arrived_at=_aware(arrived_at),
            departed_at=_aware(punched_at),
            break_minutes=break_minutes,
            notes=notes,
        ),
    )
    return _Verdict(
        RECORDED,
        user_id=user_id,
        roster_assignment_id=roster_assignment_id,
        kind=ClockPunchKind.DEPART.value,
    )


async def _write_arrival(
    session: AsyncSession,
    actor_id: uuid.UUID,
    department_id: str,
    user_id: uuid.UUID,
    device_user_id: str,
    punched_at: datetime,
    marker: str,
) -> _Verdict:
    if await _earlier_undecided(session, department_id, device_user_id, punched_at):
        return _Verdict(
            NO_SHIFT,
            user_id=user_id,
            kind=ClockPunchKind.ARRIVE.value,
            detail=UNDECIDED_DETAIL,
        )
    found = await clock_service.current_assignment(
        session, user_id, punched_at, department_id
    )
    if found is None:
        return _Verdict(
            NO_SHIFT,
            user_id=user_id,
            kind=ClockPunchKind.ARRIVE.value,
            detail=NO_SHIFT_DETAIL,
        )
    assignment, shift = found
    assignment_id = assignment.id
    start, end = scheduled_bounds(assignment, shift)
    if abs(punched_at - end) < abs(punched_at - start):
        return _Verdict(
            NO_SHIFT,
            user_id=user_id,
            kind=ClockPunchKind.ARRIVE.value,
            detail=NEAR_END_DETAIL,
        )
    await _require_proxy(session, actor_id, user_id)
    await save_attendance(
        session=session,
        current_user=await _load_user(session, user_id),
        payload=AttendanceSave(
            roster_assignment_id=assignment_id,
            expected_revision=0,
            arrived_at=_aware(punched_at),
            notes=marker[:NOTES_MAX],
        ),
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
    conditions: list[ColumnElement[bool]] = [
        TerminalPunch.department_id == department_id
    ]
    if outcome is None:
        conditions.append(TerminalPunch.outcome.in_(_ATTENTION))
    else:
        conditions.append(TerminalPunch.outcome == outcome.value)
    if terminal:
        conditions.append(TerminalPunch.terminal == normalise_terminal(terminal))
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
