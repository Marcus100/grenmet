import uuid
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Query, status

from src.auth.models import User
from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import PublicHolidayDep, RosterPeriodDep
from src.models import ApiError

from . import rule_service, service
from .models import (
    RosterAvailability,
    RosterPeriodStatus,
    RosterRuleOverride,
    RosterRuleSet,
    RuleOverrideContext,
    WorkerType,
)
from .rules import RosterRules
from .schemas import (
    ProvisionalHolidaysRequest,
    PublicHolidayCreate,
    PublicHolidayPublic,
    PublicHolidaysPublic,
    PublicHolidayUpdate,
    RosterAssignmentBulkCreate,
    RosterAssignmentPublic,
    RosterCalendarEntry,
    RosterCalendarPublic,
    RosterCsvImportResponse,
    RosterCsvValidationRequest,
    RosterCsvValidationResponse,
    RosterGridImportRequest,
    RosterGridImportResult,
    RosterGridPreview,
    RosterPeriodCreate,
    RosterPeriodDetails,
    RosterPeriodPublic,
    RosterPeriodsPublic,
    RosterPublishRequest,
    RosterRevisionPublic,
    RosterRevisionsPublic,
    RosterRuleCheckPublic,
    RosterRuleOverridePublic,
    RosterRuleOverridesPublic,
    RosterRuleProfilePublic,
    RosterRuleProfilesPublic,
    RosterRuleProfileUpdate,
    RosterRuleSetPublic,
    RosterRuleSetUpdate,
    RosterRulesPublic,
    RosterRulesUpdate,
    RosterRuleWarningsErrorPublic,
    RuleSetSource,
    RuleViolationPublic,
    ShiftCatalogCreate,
    ShiftCatalogPublic,
    ShiftCatalogsPublic,
    ShiftCatalogUpdate,
    violation_public,
)

router = APIRouter(prefix="/hr/rosters", tags=["hr-rosters"])

RULE_WARNINGS_RESPONSE = {
    "model": RosterRuleWarningsErrorPublic,
    "description": (
        "The change breaks roster rules; resend with rule_override_reason to save "
        "anyway"
    ),
}


@router.get(
    "/shifts",
    response_model=ShiftCatalogsPublic,
    summary="List shift catalog",
    description=(
        "Return the shift catalog for roster assignment. Pass "
        "include_inactive=true (requires roster.manage) to include deactivated "
        "shift types for management screens."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Shift catalog returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def list_shift_catalog(
    session: SessionDep,
    current_user: CurrentUser,
    include_inactive: bool = False,
) -> Any:
    shifts = await service.read_shift_catalog(
        session=session,
        current_user=current_user,
        include_inactive=include_inactive,
    )
    return ShiftCatalogsPublic(
        data=[
            ShiftCatalogPublic.model_validate(shift, from_attributes=True)
            for shift in shifts
        ],
        count=len(shifts),
    )


@router.post(
    "/shifts",
    response_model=ShiftCatalogPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create shift type",
    description="Create a shift catalog entry. Requires roster.manage permission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Shift type created"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "A shift with this code exists",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def create_shift(
    *, session: SessionDep, current_user: CurrentUser, payload: ShiftCatalogCreate
) -> Any:
    shift = await service.create_shift(
        session=session, current_user=current_user, shift_in=payload
    )
    return ShiftCatalogPublic.model_validate(shift, from_attributes=True)


@router.patch(
    "/shifts/{code}",
    response_model=ShiftCatalogPublic,
    summary="Update or deactivate shift type",
    description=(
        "Update a shift catalog entry; set is_active=false to deactivate it "
        "(historical rosters are preserved). Requires roster.manage permission."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Shift type updated"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Shift type not found",
        },
    },
)
async def update_shift(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    code: str,
    payload: ShiftCatalogUpdate,
) -> Any:
    shift = await service.update_shift(
        session=session, current_user=current_user, code=code, shift_in=payload
    )
    return ShiftCatalogPublic.model_validate(shift, from_attributes=True)


@router.get(
    "/periods",
    response_model=RosterPeriodsPublic,
    summary="List roster periods",
    description="Return roster periods for a department, newest first. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Roster periods returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def list_periods(
    session: SessionDep,
    current_user: CurrentUser,
    department_id: str,
    period_status: RosterPeriodStatus | None = None,
) -> Any:
    periods = await service.list_roster_periods(
        session=session,
        current_user=current_user,
        department_id=department_id,
        period_status=period_status,
    )
    return RosterPeriodsPublic(
        data=[
            RosterPeriodPublic.model_validate(period, from_attributes=True)
            for period in periods
        ],
        count=len(periods),
    )


@router.post(
    "/periods",
    response_model=RosterPeriodPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create roster period",
    description="Create a new roster period. Requires roster.manage permission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Roster period created"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Validation error (e.g. period_end before period_start)",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def create_period(
    *, session: SessionDep, current_user: CurrentUser, payload: RosterPeriodCreate
) -> Any:
    return await service.create_roster_period(
        session=session, current_user=current_user, period_in=payload
    )


@router.post(
    "/assignments/bulk",
    response_model=list[RosterAssignmentPublic],
    summary="Bulk upsert roster assignments",
    description="Create or update roster assignments while preserving linked row IDs. Requires roster.manage permission. Rejects closed periods, invalid dates/codes, duplicate employee dates and cross-period overwrite.",
    responses={
        status.HTTP_200_OK: {"description": "Assignments created or updated"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Invalid batch or roster conflict",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Roster period not found",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
        status.HTTP_409_CONFLICT: RULE_WARNINGS_RESPONSE,
    },
)
async def bulk_assignments(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterAssignmentBulkCreate,
) -> Any:
    assignments = await service.bulk_upsert_roster_assignments(
        session=session, current_user=current_user, payload=payload
    )
    availability = await service.assignment_availability(
        session, [row.id for row in assignments]
    )
    return [
        RosterAssignmentPublic.model_validate(
            assignment, from_attributes=True
        ).model_copy(
            update={
                "availability": availability.get(
                    assignment.id, RosterAvailability.SCHEDULED
                )
            }
        )
        for assignment in assignments
    ]


@router.get(
    "/periods/{period_id}",
    response_model=RosterPeriodDetails,
    summary="Get roster period details",
    description="Return a roster period and its assignments. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Period and assignments returned"},
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Roster period not found",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def get_period(
    session: SessionDep,
    current_user: CurrentUser,
    period: RosterPeriodDep,
) -> Any:
    period_data, assignments = await service.read_roster_period_details(
        session=session, current_user=current_user, period_id=period.id
    )
    availability = await service.assignment_availability(
        session, [row.id for row in assignments]
    )
    return RosterPeriodDetails(
        period=RosterPeriodPublic.model_validate(period_data, from_attributes=True),
        assignments=[
            RosterAssignmentPublic.model_validate(
                assignment, from_attributes=True
            ).model_copy(
                update={
                    "availability": availability.get(
                        assignment.id, RosterAvailability.SCHEDULED
                    )
                }
            )
            for assignment in assignments
        ],
    )


@router.get(
    "/assignments",
    response_model=RosterCalendarPublic,
    summary="List roster assignments for a date range",
    description=(
        "Return rostered days between start and end, expanded to concrete local "
        "times, for the calendar. scope=me (the default) returns the caller's own "
        "assignments and needs no roster permission; scope=department returns the "
        "whole department's and requires roster.view. Draft periods are included "
        "only for callers with roster.manage. The range is capped at 92 days."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Assignments returned"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Invalid date range",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Department not found",
        },
    },
)
async def list_assignments(
    session: SessionDep,
    current_user: CurrentUser,
    start: date,
    end: date,
    department_id: str | None = None,
    scope: Annotated[Literal["me", "department"], Query()] = "me",
) -> Any:
    rows = await service.read_roster_calendar(
        session=session,
        current_user=current_user,
        start=start,
        end=end,
        department_id=department_id,
        department_scope=scope == "department",
    )
    availability = await service.assignment_availability(
        session, [row[0].id for row in rows]
    )
    return RosterCalendarPublic(
        data=[
            RosterCalendarEntry(
                user_id=user.id,
                display_name=user.full_name,
                roster_name=employment.roster_name,
                assignment_date=assignment.assignment_date,
                shift_code=assignment.shift_code,
                label=shift.label,
                category=shift.category,
                starts_at_local=starts_at,
                ends_at_local=ends_at,
                all_day=starts_at is None,
                is_draft=is_draft,
                availability=availability.get(
                    assignment.id, RosterAvailability.SCHEDULED
                ),
            )
            for assignment, shift, user, employment, is_draft in rows
            for starts_at, ends_at in [service.calendar_times(assignment, shift)]
        ],
        count=len(rows),
    )


@router.post(
    "/import-grid/validate",
    response_model=RosterGridPreview,
    summary="Preview a grid roster import",
    description="Parse a name×day grid CSV, match names to department staff, and report unmatched names / invalid codes without importing. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Preview returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Department not found",
        },
    },
)
async def validate_grid(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterGridImportRequest,
) -> Any:
    return await service.validate_roster_grid(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/import-grid",
    response_model=RosterGridImportResult,
    summary="Import a grid roster",
    description="Import a name×day grid CSV into a draft roster period (created or reused for the month). Blocked if any name is unmatched or any code invalid. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Roster imported"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Grid has unmatched names or invalid codes",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Department not found",
        },
    },
)
async def import_grid(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterGridImportRequest,
) -> Any:
    return await service.import_roster_grid(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/import-csv/validate",
    response_model=RosterCsvValidationResponse,
    summary="Validate roster CSV",
    description="Validate CSV content for roster import. Requires roster.import permission.",
    responses={
        status.HTTP_200_OK: {"description": "Validation result returned"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Invalid CSV (e.g. missing header or columns)",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def validate_csv(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterCsvValidationRequest,
) -> Any:
    return await service.validate_roster_csv(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/import-csv",
    response_model=RosterCsvImportResponse,
    summary="Import roster from CSV",
    description="Create roster import job and optionally apply valid rows. Requires roster.import permission.",
    responses={
        status.HTTP_200_OK: {"description": "Import job created"},
        status.HTTP_400_BAD_REQUEST: {"model": ApiError, "description": "Invalid CSV"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def import_csv(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterCsvValidationRequest,
) -> Any:
    job = await service.import_roster_csv(
        session=session, current_user=current_user, payload=payload
    )
    return RosterCsvImportResponse(
        job_id=job.id,
        status=job.status,
        total_rows=job.total_rows,
        valid_rows=job.valid_rows,
        invalid_rows=job.invalid_rows,
    )


# ---------------------------------------------------------------------------
# Roster period lifecycle
# ---------------------------------------------------------------------------


# Publishing without a body is the usual case: no override reason.
_NO_OVERRIDE = RosterPublishRequest()


@router.patch(
    "/periods/{period_id}/publish",
    response_model=RosterPeriodPublic,
    summary="Publish roster period",
    description=(
        "Transition a draft roster period to published. If the roster breaks a "
        "roster rule the request fails with 409 and the warnings; resend with "
        "rule_override_reason to publish anyway (recorded with the supervisor and "
        "the rules). Requires roster.manage permission."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Roster period published"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Period already published or closed",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Roster period not found",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
        status.HTTP_409_CONFLICT: RULE_WARNINGS_RESPONSE,
    },
)
async def publish_period(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    period: RosterPeriodDep,
    payload: Annotated[RosterPublishRequest, Body()] = _NO_OVERRIDE,
) -> Any:
    return await service.publish_roster_period(
        session=session,
        current_user=current_user,
        period_id=period.id,
        rule_override_reason=payload.rule_override_reason,
    )


@router.patch(
    "/periods/{period_id}/close",
    response_model=RosterPeriodPublic,
    summary="Close roster period",
    description="Close a published roster period. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Roster period closed"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Period not published or already closed",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Roster period not found",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def close_period(
    *, session: SessionDep, current_user: CurrentUser, period: RosterPeriodDep
) -> Any:
    return await service.close_roster_period(
        session=session, current_user=current_user, period_id=period.id
    )


@router.get(
    "/periods/{period_id}/revisions",
    response_model=RosterRevisionsPublic,
    summary="List roster period revisions",
    description="Return the revision history for a roster period. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Revisions returned"},
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Roster period not found",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def get_period_revisions(
    session: SessionDep,
    current_user: CurrentUser,
    period: RosterPeriodDep,
) -> Any:
    revisions = await service.list_roster_revisions(
        session=session, current_user=current_user, period_id=period.id
    )
    return RosterRevisionsPublic(
        data=[
            RosterRevisionPublic.model_validate(rev, from_attributes=True)
            for rev in revisions
        ],
        count=len(revisions),
    )


# ---------------------------------------------------------------------------
# Public Holidays
# ---------------------------------------------------------------------------


@router.post(
    "/public-holidays",
    response_model=PublicHolidayPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create public holiday",
    description="Add a public holiday. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Public holiday created"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Duplicate date",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def create_holiday(
    *, session: SessionDep, current_user: CurrentUser, payload: PublicHolidayCreate
) -> Any:
    return await service.create_public_holiday(
        session=session, current_user=current_user, payload=payload
    )


@router.get(
    "/public-holidays",
    response_model=PublicHolidaysPublic,
    summary="List public holidays",
    description="Return public holidays, optionally filtered by year. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Public holidays returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def list_holidays(
    session: SessionDep, current_user: CurrentUser, year: int | None = None
) -> Any:
    holidays = await service.list_public_holidays(
        session=session, current_user=current_user, year=year
    )
    return PublicHolidaysPublic(
        data=[
            PublicHolidayPublic.model_validate(h, from_attributes=True)
            for h in holidays
        ],
        count=len(holidays),
    )


@router.put(
    "/public-holidays/{holiday_id}",
    response_model=PublicHolidayPublic,
    summary="Update public holiday",
    description="Edit a public holiday's name, date, source or verification flag. Requires global roster.manage permission.",
    responses={
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Duplicate date",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Public holiday not found",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def update_holiday(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    holiday: PublicHolidayDep,
    payload: PublicHolidayUpdate,
) -> Any:
    return await service.update_public_holiday(
        session=session,
        current_user=current_user,
        holiday_id=holiday.id,
        payload=payload,
    )


@router.post(
    "/public-holidays/provisional",
    response_model=PublicHolidaysPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Load provisional public holidays",
    description="Add the provisional Grenada public holidays for a year, skipping dates that already exist. Rows are marked provisional for GAA HR to verify and edit. Requires global roster.manage permission.",
    responses={
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Year out of range",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def load_provisional_holidays(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: ProvisionalHolidaysRequest,
) -> Any:
    created = await service.load_provisional_holidays(
        session=session, current_user=current_user, year=payload.year
    )
    return PublicHolidaysPublic(
        data=[
            PublicHolidayPublic.model_validate(h, from_attributes=True) for h in created
        ],
        count=len(created),
    )


@router.delete(
    "/public-holidays/{holiday_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete public holiday",
    description="Remove a public holiday. Requires roster.manage permission.",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Public holiday deleted"},
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Public holiday not found",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def remove_holiday(
    *, session: SessionDep, current_user: CurrentUser, holiday: PublicHolidayDep
) -> None:
    await service.delete_public_holiday(
        session=session, current_user=current_user, holiday_id=holiday.id
    )


def _rules_public(department_id: str, rules: RosterRules) -> RosterRulesPublic:
    """Pre-#380 shape: consecutive days and weekly hours only."""
    return RosterRulesPublic(
        department_id=department_id,
        min_rest_hours=None,
        max_consecutive_days=rules.max_consecutive_shifts,
        max_weekly_hours=rules.shift_weekly_hours,
    )


def rule_set_public(
    *,
    organisation_id: str,
    department_id: str | None,
    row: RosterRuleSet | None,
    source: RuleSetSource,
) -> RosterRuleSetPublic:
    values = rule_service.update_from_rules(rule_service.rules_from_row(row))
    return RosterRuleSetPublic(
        **values.model_dump(),
        organisation_id=organisation_id,
        department_id=department_id,
        source=source,
        updated_by_user_id=row.updated_by_user_id if row else None,
        updated_at=row.updated_at if row else None,
    )


@router.get(
    "/departments/{department_id}/rules",
    response_model=RosterRulesPublic,
    deprecated=True,
    summary="Read department roster rule limits (deprecated)",
    description=(
        "Deprecated: use GET /departments/{department_id}/rule-set. Returns the "
        "effective consecutive-shift and weekly-hour limits; min_rest_hours is "
        "always null (there is no minimum-rest rule). Requires roster.view within "
        "the department scope."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Rule limits returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Department outside your scope",
        },
    },
)
async def get_department_rules(
    *, session: SessionDep, current_user: CurrentUser, department_id: str
) -> Any:
    rules = await rule_service.read_department_rules(
        session=session, current_user=current_user, department_id=department_id
    )
    return _rules_public(department_id, rules)


@router.put(
    "/departments/{department_id}/rules",
    response_model=RosterRulesPublic,
    deprecated=True,
    summary="Set department roster rule limits (deprecated)",
    description=(
        "Deprecated: use PUT /departments/{department_id}/rule-set. Sets the "
        "department's consecutive-shift and weekly-hour limits on its rule set; "
        "min_rest_hours is ignored. Requires roster.rules.manage within the "
        "department scope."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Rule limits saved"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def put_department_rules(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    department_id: str,
    data: RosterRulesUpdate,
) -> Any:
    rules = await rule_service.update_department_rules(
        session=session,
        current_user=current_user,
        department_id=department_id,
        data=data,
    )
    return _rules_public(department_id, rules)


@router.get(
    "/periods/{period_id}/rule-check",
    response_model=RosterRuleCheckPublic,
    summary="Check a roster period against department rules",
    description=(
        "Return the roster rule breaches in a roster period (consecutive shifts, "
        "days off, daily and weekly hours, weekends, Monday-to-Friday pattern). "
        "Neighbouring published periods are included so runs crossing the edge "
        "are seen; staff not covered by the union agreement are not checked. "
        "Requires roster.view."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Rule check returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Department outside your scope",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Roster period not found",
        },
    },
)
async def check_period_rules(
    *, session: SessionDep, current_user: CurrentUser, period: RosterPeriodDep
) -> Any:
    checked, rules, violations = await rule_service.check_period_rules(
        session=session, current_user=current_user, period_id=period.id
    )
    department, row, source = await rule_service.read_department_rule_set(
        session=session, current_user=current_user, department_id=checked.department_id
    )
    return RosterRuleCheckPublic(
        period_id=checked.id,
        rules=_rules_public(checked.department_id, rules),
        violations=[violation_public(v) for v in violations],
        count=len(violations),
        rule_set=rule_set_public(
            organisation_id=department.organisation_id,
            department_id=department.id,
            row=row,
            source=source,
        ),
    )


@router.get(
    "/organisations/{organisation_id}/rule-set",
    response_model=RosterRuleSetPublic,
    summary="Read the organisation's default roster rules",
    description=(
        "Return the organisation's default roster rule set (source DEFAULT when "
        "none is saved and the built-in values apply). Requires organisation-wide "
        "roster.rules.manage."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Rule set returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def get_organisation_rule_set(
    *, session: SessionDep, current_user: CurrentUser, organisation_id: str
) -> Any:
    row, source = await rule_service.read_organisation_rule_set(
        session=session, current_user=current_user, organisation_id=organisation_id
    )
    return rule_set_public(
        organisation_id=organisation_id, department_id=None, row=row, source=source
    )


@router.put(
    "/organisations/{organisation_id}/rule-set",
    response_model=RosterRuleSetPublic,
    summary="Save the organisation's default roster rules",
    description=(
        "Replace the organisation's default roster rules, used by every department "
        "without its own rule set. A null limit disables that rule. Requires "
        "organisation-wide roster.rules.manage."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Rule set saved"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def put_organisation_rule_set(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: str,
    data: RosterRuleSetUpdate,
) -> Any:
    row = await rule_service.save_organisation_rule_set(
        session=session,
        current_user=current_user,
        organisation_id=organisation_id,
        data=data,
    )
    return rule_set_public(
        organisation_id=organisation_id,
        department_id=None,
        row=row,
        source=RuleSetSource.ORGANISATION,
    )


@router.get(
    "/departments/{department_id}/rule-set",
    response_model=RosterRuleSetPublic,
    summary="Read a department's effective roster rules",
    description=(
        "Return the rules that apply to a department: its own rule set, else the "
        "organisation default, else the built-in defaults (see source). Requires "
        "roster.view within the department scope."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Rule set returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Department outside your scope",
        },
    },
)
async def get_department_rule_set(
    *, session: SessionDep, current_user: CurrentUser, department_id: str
) -> Any:
    department, row, source = await rule_service.read_department_rule_set(
        session=session, current_user=current_user, department_id=department_id
    )
    return rule_set_public(
        organisation_id=department.organisation_id,
        department_id=department.id,
        row=row,
        source=source,
    )


@router.put(
    "/departments/{department_id}/rule-set",
    response_model=RosterRuleSetPublic,
    summary="Save a department's own roster rules",
    description=(
        "Give a department its own roster rules, replacing the organisation "
        "default for it. A null limit disables that rule. Requires "
        "roster.rules.manage within the department scope."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Rule set saved"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def put_department_rule_set(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    department_id: str,
    data: RosterRuleSetUpdate,
) -> Any:
    row = await rule_service.save_department_rule_set(
        session=session,
        current_user=current_user,
        department_id=department_id,
        data=data,
    )
    return rule_set_public(
        organisation_id=row.organisation_id,
        department_id=department_id,
        row=row,
        source=RuleSetSource.DEPARTMENT,
    )


@router.delete(
    "/departments/{department_id}/rule-set",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Return a department to the organisation's roster rules",
    description=(
        "Remove the department's own rule set so the organisation default applies "
        "again. Requires roster.rules.manage within the department scope."
    ),
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Department rule set removed"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def delete_department_rule_set(
    *, session: SessionDep, current_user: CurrentUser, department_id: str
) -> None:
    await rule_service.clear_department_rule_set(
        session=session, current_user=current_user, department_id=department_id
    )


def _profile_public(
    rules: RosterRules, employment: Any, user: User
) -> RosterRuleProfilePublic:
    worker = (
        WorkerType(employment.rule_worker_type) if employment.rule_worker_type else None
    )
    return RosterRuleProfilePublic(
        user_id=user.id,
        full_name=f"{user.first_name} {user.last_name}".strip(),
        employee_number=employment.employee_number,
        union_covered=employment.union_covered,
        worker_type=worker,
        effective_worker_type=worker or rules.worker_type,
    )


@router.get(
    "/departments/{department_id}/rule-profiles",
    response_model=RosterRuleProfilesPublic,
    summary="List staff union coverage and worker type",
    description=(
        "Return each department member's union coverage flag and worker type for "
        "the roster rules. Requires roster.rules.manage within the department "
        "scope."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Profiles returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def list_rule_profiles(
    *, session: SessionDep, current_user: CurrentUser, department_id: str
) -> Any:
    rules, rows = await rule_service.list_rule_profiles(
        session=session, current_user=current_user, department_id=department_id
    )
    data = [_profile_public(rules, employment, user) for employment, user in rows]
    return RosterRuleProfilesPublic(data=data, count=len(data))


@router.put(
    "/employees/{user_id}/rule-profile",
    response_model=RosterRuleProfilePublic,
    summary="Set an employee's union coverage and worker type",
    description=(
        "Turn the union roster rules on or off for an employee (for example off "
        "for management) and optionally set their worker type. Uncovered staff "
        "are not checked. Audited. Requires roster.rules.manage within the "
        "employee's department scope; you cannot change your own."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Profile saved"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Employee not found",
        },
    },
)
async def put_rule_profile(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    data: RosterRuleProfileUpdate,
) -> Any:
    rules, employment, user = await rule_service.update_rule_profile(
        session=session, current_user=current_user, user_id=user_id, data=data
    )
    return _profile_public(rules, employment, user)


def _override_public(
    override: RosterRuleOverride, user: User
) -> RosterRuleOverridePublic:
    return RosterRuleOverridePublic(
        id=override.id,
        department_id=override.department_id,
        context=RuleOverrideContext(override.context),
        entity_type=override.entity_type,
        entity_id=override.entity_id,
        rule_codes=override.rule_codes,
        violations=[RuleViolationPublic.model_validate(v) for v in override.violations],
        reason=override.reason,
        overridden_by_user_id=override.overridden_by_user_id,
        overridden_by_name=f"{user.first_name} {user.last_name}".strip(),
        created_at=override.created_at,
    )


@router.get(
    "/departments/{department_id}/rule-overrides",
    response_model=RosterRuleOverridesPublic,
    summary="List roster rule overrides",
    description=(
        "Return the latest saves made despite roster rule warnings in a "
        "department: who, when, which rules and the reason. Requires "
        "roster.rules.manage or roster.manage within the department scope."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Overrides returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def list_rule_overrides(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    department_id: str,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> Any:
    rows = await rule_service.list_overrides(
        session=session,
        current_user=current_user,
        department_id=department_id,
        limit=limit,
    )
    data = [_override_public(override, user) for override, user in rows]
    return RosterRuleOverridesPublic(data=data, count=len(data))
