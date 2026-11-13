"""Terminal punch import routes (ADR-0040, Decision 4).

Every route needs ``roster.manage`` in the department scope (checked by the service).
Thin: parsing and decisions live in ``terminal_service``.
"""

import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, Query, UploadFile, status

from src.dependencies import CurrentUser, SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND

from . import terminal_service
from .models import (
    ClockPunchKind,
    TerminalAttentionOutcome,
    TerminalPunchOutcome,
)
from .terminal_schemas import (
    TerminalImportErrorPublic,
    TerminalImportPublic,
    TerminalPunchesPublic,
    TerminalPunchPublic,
    TerminalReprocessPublic,
    TerminalReprocessRequest,
    TerminalUserCreate,
    TerminalUserPublic,
    TerminalUsersPublic,
    outcome_counts,
)

router = APIRouter(prefix="/hr/attendance", tags=["hr-attendance"])

DEPARTMENT_ID = Annotated[str, Query(min_length=1, max_length=64)]


def _mapping_public(row: terminal_service.MappingRow) -> TerminalUserPublic:
    mapping = row.mapping
    return TerminalUserPublic(
        id=mapping.id,
        department_id=mapping.department_id,
        device_user_id=mapping.device_user_id,
        user_id=mapping.user_id,
        employee_name=row.employee_name,
        created_at=mapping.created_at,
    )


def _punch_public(row: terminal_service.PunchRow) -> TerminalPunchPublic:
    punch = row.punch
    return TerminalPunchPublic(
        id=punch.id,
        department_id=punch.department_id,
        terminal=punch.terminal,
        device_user_id=punch.device_user_id,
        punched_at=punch.punched_at,
        user_id=punch.user_id,
        employee_name=row.employee_name,
        roster_assignment_id=punch.roster_assignment_id,
        kind=ClockPunchKind(punch.kind) if punch.kind else None,
        outcome=TerminalPunchOutcome(punch.outcome),
        detail=punch.detail,
        import_id=punch.import_id,
    )


@router.get(
    "/terminal-users",
    response_model=TerminalUsersPublic,
    summary="List terminal user mappings",
    description="Device user IDs mapped to employees in a department. Requires roster.manage in the department scope.",
    operation_id="hrListTerminalUsers",
    responses={**AUTHENTICATED},
)
async def list_terminal_users(
    *, session: SessionDep, current_user: CurrentUser, department_id: DEPARTMENT_ID
) -> Any:
    rows = await terminal_service.list_mappings(
        session=session, current_user=current_user, department_id=department_id
    )
    return TerminalUsersPublic(
        data=[_mapping_public(row) for row in rows], count=len(rows)
    )


@router.post(
    "/terminal-users",
    response_model=TerminalUserPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Map a terminal user ID to an employee",
    description=(
        "One device ID per person and one person per device ID in the department. "
        "Only the device's user ID is stored, never biometric data. Requires "
        "roster.manage in the department scope."
    ),
    operation_id="hrAddTerminalUser",
    responses={**AUTHENTICATED, **BAD_REQUEST, **CONFLICT},
)
async def add_terminal_user(
    *, session: SessionDep, current_user: CurrentUser, payload: TerminalUserCreate
) -> Any:
    row = await terminal_service.add_mapping(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        device_user_id=payload.device_user_id,
        user_id=payload.user_id,
    )
    return _mapping_public(row)


@router.delete(
    "/terminal-users/{terminal_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a terminal user mapping",
    description="Punches already decided keep their outcome; run reprocess to decide held punches again. Requires roster.manage in the department scope.",
    operation_id="hrRemoveTerminalUser",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def remove_terminal_user(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    terminal_user_id: uuid.UUID,
) -> None:
    await terminal_service.remove_mapping(
        session=session,
        current_user=current_user,
        terminal_user_id=terminal_user_id,
    )


@router.post(
    "/terminal-imports",
    response_model=TerminalImportPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Import a terminal punch export",
    description=(
        "Upload a ZKTeco ATTLOG text export, or a CSV with a device_user_id,punched_at "
        "header. Times are Grenada local. Each new punch is decided in time order: an "
        "arrival or departure is recorded through the phone-punch attendance path; "
        "unmapped, repeat, unmatched and refused punches are kept with their outcome. "
        "Re-uploading the same file (same terminal label) imports nothing twice. "
        "Requires roster.manage in the department scope."
    ),
    operation_id="hrImportTerminalPunches",
    responses={**AUTHENTICATED, **BAD_REQUEST, **CONFLICT},
)
async def import_terminal_punches(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    file: Annotated[
        UploadFile,
        File(
            description="ZKTeco ATTLOG text export or CSV (device_user_id,punched_at)"
        ),
    ],
    department_id: Annotated[str, Form(min_length=1, max_length=64)],
    terminal: Annotated[str, Form(min_length=1, max_length=60)],
) -> Any:
    content = await file.read(terminal_service.MAX_IMPORT_BYTES + 1)
    summary = await terminal_service.import_export(
        session=session,
        current_user=current_user,
        department_id=department_id,
        terminal=terminal,
        content=content,
    )
    return TerminalImportPublic(
        import_id=summary.import_id,
        department_id=department_id,
        terminal=terminal,
        new_punches=summary.new_punches,
        duplicates=summary.duplicates,
        errors=[
            TerminalImportErrorPublic(line=error.line, message=error.message)
            for error in summary.errors
        ],
        outcomes=outcome_counts(summary.outcomes),
        rows=[_punch_public(row) for row in summary.rows],
    )


@router.get(
    "/terminal-punches",
    response_model=TerminalPunchesPublic,
    summary="List terminal punches that need HR attention",
    description=(
        "By default UNMAPPED, NO_SHIFT and REFUSED punches, oldest first. Filter by "
        "one outcome, terminal label or Grenada local date range. Requires "
        "roster.manage in the department scope."
    ),
    operation_id="hrListTerminalPunches",
    responses={**AUTHENTICATED, **BAD_REQUEST},
)
async def list_terminal_punches(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    department_id: DEPARTMENT_ID,
    outcome: Annotated[TerminalAttentionOutcome | None, Query()] = None,
    terminal: Annotated[str | None, Query(min_length=1, max_length=60)] = None,
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
) -> Any:
    outcome_filter = TerminalPunchOutcome(outcome.value) if outcome else None
    rows, total = await terminal_service.list_punches(
        session=session,
        current_user=current_user,
        department_id=department_id,
        outcome=outcome_filter,
        terminal=terminal,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )
    return TerminalPunchesPublic(data=[_punch_public(row) for row in rows], count=total)


@router.post(
    "/terminal-punches/reprocess",
    response_model=TerminalReprocessPublic,
    summary="Decide held terminal punches again",
    description=(
        "Runs the import decisions again for a department's UNMAPPED and NO_SHIFT "
        "punches, after a device mapping or roster change. Requires roster.manage in "
        "the department scope."
    ),
    operation_id="hrReprocessTerminalPunches",
    responses={**AUTHENTICATED, **BAD_REQUEST},
)
async def reprocess_terminal_punches(
    *, session: SessionDep, current_user: CurrentUser, payload: TerminalReprocessRequest
) -> Any:
    summary = await terminal_service.reprocess(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
    )
    return TerminalReprocessPublic(
        processed=summary.processed,
        outcomes=outcome_counts(summary.outcomes),
        remaining=summary.remaining,
    )
