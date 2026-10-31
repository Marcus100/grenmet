"""Payroll inputs (slice 1): quantities for HrPlus, never money."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, Response, status

from src.dependencies import CurrentUser, SessionDep, TokenDep
from src.models import ApiError

from . import overtime, service
from .models import PayItem, PayPeriod
from .schemas import (
    EmployeePayProfilePublic,
    EmployeePayProfilesPublic,
    EmployeePayProfileUpdate,
    PayCalendarCreate,
    PayCalendarPublic,
    PayCalendarsPublic,
    PayItemPublic,
    PayItemsPublic,
    PayLineManualCreate,
    PayLinePublic,
    PayLinesPublic,
    PayPeriodCreate,
    PayPeriodDetail,
    PayPeriodPublic,
    PayPeriodReturn,
    PayPeriodReview,
    PayPeriodsPublic,
    PayrollDepartmentSettingPublic,
    PayrollDepartmentSettingsPublic,
    PayrollDepartmentSettingUpdate,
)

router = APIRouter(prefix="/hr/payroll", tags=["hr-payroll"])

ERRORS: dict[int | str, dict[str, Any]] = {
    400: {"model": ApiError, "description": "Invalid payroll input"},
    401: {"model": ApiError, "description": "Not signed in"},
    403: {
        "model": ApiError,
        "description": "Missing payroll permission, organisation-wide scope or two-step verification",
    },
    404: {
        "model": ApiError,
        "description": "Not found, or no payroll access in this organisation",
    },
    409: {
        "model": ApiError,
        "description": "The period is not in a state that allows this, or the data conflicts",
    },
}
OrganisationQuery = Annotated[str | None, Query(max_length=100)]
Skip = Annotated[int, Query(ge=0, le=100_000)]
Limit = Annotated[int, Query(ge=1, le=500)]


def _item(item: PayItem) -> PayItemPublic:
    return PayItemPublic.model_validate(
        {
            **{
                column: getattr(item, column)
                for column in PayItemPublic.model_fields
                if column != "accepts_manual_lines"
            },
            "accepts_manual_lines": service.accepts_manual_lines(item),
        }
    )


def _period(view: tuple[PayPeriod, str, Any]) -> PayPeriodPublic:
    period, calendar_name, review_status = view
    return PayPeriodPublic.model_validate(
        {
            **{
                column: getattr(period, column)
                for column in PayPeriodPublic.model_fields
                if column not in {"calendar_name", "review_status"}
            },
            "calendar_name": calendar_name,
            "review_status": review_status,
        }
    )


async def _detail(
    session: SessionDep, current_user: CurrentUser, period_id: uuid.UUID
) -> PayPeriodDetail:
    data = await service.period_detail(session, current_user, period_id)
    return PayPeriodDetail.model_validate(
        {
            **data,
            "period": _period(data.pop("view")),  # type: ignore[arg-type]
            "overtime_bands_available": overtime.source().available,
        }
    )


@router.get(
    "/items",
    response_model=PayItemsPublic,
    status_code=status.HTTP_200_OK,
    summary="List the organisation's pay items",
    description="The pay item catalogue: what is counted, how, and whether the rule is still provisional. No rates or amounts. A new organisation has none.",
    operation_id="hrListPayItems",
    responses=ERRORS,
)
async def list_items(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: OrganisationQuery = None,
) -> PayItemsPublic:
    items = await service.list_items(session, current_user, organisation_id)
    return PayItemsPublic(
        data=[_item(item) for item in items],
        overtime_bands_available=overtime.source().available,
    )


@router.get(
    "/calendars",
    response_model=PayCalendarsPublic,
    status_code=status.HTTP_200_OK,
    summary="List pay calendars",
    description="Pay calendars of the organisation; the default one applies to anyone without their own.",
    operation_id="hrListPayCalendars",
    responses=ERRORS,
)
async def list_calendars(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: OrganisationQuery = None,
) -> PayCalendarsPublic:
    calendars = await service.list_calendars(session, current_user, organisation_id)
    return PayCalendarsPublic(
        data=[
            PayCalendarPublic.model_validate(calendar, from_attributes=True)
            for calendar in calendars
        ]
    )


@router.post(
    "/calendars",
    response_model=PayCalendarPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a pay calendar",
    description="Needs organisation-wide hr.payroll.prepare. The approving department's PAYROLL_RUN workflow approves its periods. Starts provisional.",
    operation_id="hrCreatePayCalendar",
    responses=ERRORS,
)
async def create_calendar(
    *, session: SessionDep, current_user: CurrentUser, payload: PayCalendarCreate
) -> PayCalendarPublic:
    calendar = await service.create_calendar(session, current_user, payload)
    return PayCalendarPublic.model_validate(calendar, from_attributes=True)


@router.get(
    "/periods",
    response_model=PayPeriodsPublic,
    status_code=status.HTTP_200_OK,
    summary="List pay periods",
    description="Newest first. Any payroll permission in the organisation can list them.",
    operation_id="hrListPayPeriods",
    responses=ERRORS,
)
async def list_periods(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: OrganisationQuery = None,
    calendar_id: uuid.UUID | None = None,
    skip: Skip = 0,
    limit: Limit = 50,
) -> PayPeriodsPublic:
    rows, count = await service.list_periods(
        session,
        current_user,
        organisation_id,
        calendar_id=calendar_id,
        skip=skip,
        limit=limit,
    )
    return PayPeriodsPublic(data=[_period(row) for row in rows], count=count)


@router.post(
    "/periods",
    response_model=PayPeriodPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Open a pay period",
    description="Needs organisation-wide hr.payroll.prepare. Without an end date the period runs to the end of the start month. Periods in one calendar cannot overlap.",
    operation_id="hrCreatePayPeriod",
    responses=ERRORS,
)
async def create_period(
    *, session: SessionDep, current_user: CurrentUser, payload: PayPeriodCreate
) -> PayPeriodPublic:
    period = await service.create_period(session, current_user, payload)
    return _period(await service.period_view(session, period))


@router.get(
    "/periods/{period_id}",
    response_model=PayPeriodDetail,
    status_code=status.HTTP_200_OK,
    summary="Read a pay period",
    description="Status, totals per pay item and the actions the caller may take. Totals cover only the departments the caller may read.",
    operation_id="hrGetPayPeriod",
    responses=ERRORS,
)
async def read_period(
    *, session: SessionDep, current_user: CurrentUser, period_id: uuid.UUID
) -> PayPeriodDetail:
    return await _detail(session, current_user, period_id)


@router.get(
    "/periods/{period_id}/lines",
    response_model=PayLinesPublic,
    status_code=status.HTTP_200_OK,
    summary="List pay lines",
    description="Quantities per employee and pay item, limited to the departments the caller may read.",
    operation_id="hrListPayLines",
    responses=ERRORS,
)
async def list_lines(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    period_id: uuid.UUID,
    department_id: Annotated[str | None, Query(max_length=100)] = None,
    user_id: uuid.UUID | None = None,
    skip: Skip = 0,
    limit: Limit = 200,
) -> PayLinesPublic:
    rows, count = await service.list_lines(
        session,
        current_user,
        period_id,
        department_id=department_id,
        user_id=user_id,
        skip=skip,
        limit=limit,
    )
    return PayLinesPublic(
        data=[PayLinePublic.model_validate(row) for row in rows], count=count
    )


@router.post(
    "/periods/{period_id}/lines",
    response_model=PayLinePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a pay line by hand",
    description="For manual pay items such as call-out, and overtime bands until the roster rules engine provides them. A reason is required. With adjusts_line_id the line corrects an approved period and may be negative.",
    operation_id="hrCreatePayLine",
    responses=ERRORS,
)
async def create_line(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    period_id: uuid.UUID,
    payload: PayLineManualCreate,
) -> PayLinePublic:
    line = await service.add_manual_line(session, current_user, period_id, payload)
    rows, _ = await service.list_lines(
        session,
        current_user,
        period_id,
        department_id=line.department_id,
        user_id=line.user_id,
        skip=0,
        limit=500,
    )
    return PayLinePublic.model_validate(next(r for r in rows if r["id"] == line.id))


@router.delete(
    "/periods/{period_id}/lines/{line_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a line entered by hand",
    description="Only while the period is open, and only manual lines.",
    operation_id="hrDeletePayLine",
    responses=ERRORS,
)
async def delete_line(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    period_id: uuid.UUID,
    line_id: uuid.UUID,
) -> Response:
    await service.delete_manual_line(session, current_user, period_id, line_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/periods/{period_id}/computation",
    response_model=PayPeriodDetail,
    status_code=status.HTTP_200_OK,
    summary="Recompute a pay period",
    description="Rebuilds computed lines from approved attendance and adjusts earlier approved periods. Repeating it changes nothing. Manual lines are kept.",
    operation_id="hrComputePayPeriod",
    responses=ERRORS,
)
async def compute_period(
    *, session: SessionDep, current_user: CurrentUser, period_id: uuid.UUID
) -> PayPeriodDetail:
    await service.compute(session, current_user, period_id)
    return await _detail(session, current_user, period_id)


@router.post(
    "/periods/{period_id}/submission",
    response_model=PayPeriodDetail,
    status_code=status.HTTP_200_OK,
    summary="Submit a pay period for approval",
    description="Recomputes, freezes the lines and starts the PAYROLL_RUN approval. The preparer can never approve it.",
    operation_id="hrSubmitPayPeriod",
    responses=ERRORS,
)
async def submit_period(
    *, session: SessionDep, current_user: CurrentUser, period_id: uuid.UUID
) -> PayPeriodDetail:
    await service.submit(session, current_user, period_id)
    return await _detail(session, current_user, period_id)


@router.post(
    "/periods/{period_id}/approval",
    response_model=PayPeriodDetail,
    status_code=status.HTTP_200_OK,
    summary="Approve a pay period",
    description="Needs organisation-wide hr.payroll.approve, a session verified with two-step verification, and the approval stage. The final approval locks the period.",
    operation_id="hrApprovePayPeriod",
    responses=ERRORS,
)
async def approve_period(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    period_id: uuid.UUID,
    payload: PayPeriodReview,
) -> PayPeriodDetail:
    await service.approve(
        session, current_user, period_id, comments=payload.comments, token=token
    )
    return await _detail(session, current_user, period_id)


@router.post(
    "/periods/{period_id}/return",
    response_model=PayPeriodDetail,
    status_code=status.HTTP_200_OK,
    summary="Return a pay period to the preparer",
    description="Needs organisation-wide hr.payroll.approve and a reason. The period reopens for changes.",
    operation_id="hrReturnPayPeriod",
    responses=ERRORS,
)
async def return_period(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    period_id: uuid.UUID,
    payload: PayPeriodReturn,
) -> PayPeriodDetail:
    await service.return_for_changes(
        session, current_user, period_id, comments=payload.comments
    )
    return await _detail(session, current_user, period_id)


@router.post(
    "/periods/{period_id}/export.csv",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Export a pay period as CSV",
    description="Quantities only, one row per line, with a provisional flag. Needs organisation-wide hr.payroll.export and a session verified with two-step verification. Every export is recorded in the change history.",
    operation_id="hrExportPayPeriodCsv",
    responses={
        **ERRORS,
        200: {
            "description": "Pay-input CSV",
            "content": {"text/csv": {"schema": {"type": "string"}}},
        },
    },
)
async def export_pay_period_csv(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    period_id: uuid.UUID,
) -> Response:
    name, content = await service.export_csv(
        session, current_user, period_id, token=token
    )
    return Response(
        content=content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "no-store",
        },
    )


@router.post(
    "/periods/{period_id}/closure",
    response_model=PayPeriodDetail,
    status_code=status.HTTP_200_OK,
    summary="Close an exported pay period",
    description="Needs organisation-wide hr.payroll.prepare.",
    operation_id="hrClosePayPeriod",
    responses=ERRORS,
)
async def close_period(
    *, session: SessionDep, current_user: CurrentUser, period_id: uuid.UUID
) -> PayPeriodDetail:
    await service.close(session, current_user, period_id)
    return await _detail(session, current_user, period_id)


def _profile(row: service.ProfileRow) -> EmployeePayProfilePublic:
    return EmployeePayProfilePublic.model_validate(row, from_attributes=True)


@router.get(
    "/profiles",
    response_model=EmployeePayProfilesPublic,
    status_code=status.HTTP_200_OK,
    summary="List employee pay profiles",
    description="Shift-worker flag (own or department default), calendar and payroll reference for employees in the departments the caller may read.",
    operation_id="hrListEmployeePayProfiles",
    responses=ERRORS,
)
async def list_profiles(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: OrganisationQuery = None,
    skip: Skip = 0,
    limit: Limit = 200,
) -> EmployeePayProfilesPublic:
    rows, count = await service.list_profiles(
        session, current_user, organisation_id, skip=skip, limit=limit
    )
    return EmployeePayProfilesPublic(data=[_profile(row) for row in rows], count=count)


@router.put(
    "/profiles/{user_id}",
    response_model=EmployeePayProfilePublic,
    status_code=status.HTTP_200_OK,
    summary="Set an employee's pay profile",
    description="Needs organisation-wide hr.payroll.prepare. Empty values fall back to the defaults.",
    operation_id="hrUpdateEmployeePayProfile",
    responses=ERRORS,
)
async def update_profile(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    payload: EmployeePayProfileUpdate,
) -> EmployeePayProfilePublic:
    return _profile(
        await service.update_profile(session, current_user, user_id, payload)
    )


@router.get(
    "/department-settings",
    response_model=PayrollDepartmentSettingsPublic,
    status_code=status.HTTP_200_OK,
    summary="List payroll department settings",
    description="Whether each department's staff are shift workers by default.",
    operation_id="hrListPayrollDepartmentSettings",
    responses=ERRORS,
)
async def list_department_settings(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: OrganisationQuery = None,
) -> PayrollDepartmentSettingsPublic:
    rows = await service.list_department_settings(
        session, current_user, organisation_id
    )
    return PayrollDepartmentSettingsPublic(
        data=[
            PayrollDepartmentSettingPublic(
                department_id=row[0],
                department_name=row[1],
                shift_worker_default=row[2],
            )
            for row in rows
        ]
    )


@router.put(
    "/department-settings/{department_id}",
    response_model=PayrollDepartmentSettingPublic,
    status_code=status.HTTP_200_OK,
    summary="Set a department's shift-worker default",
    description="Needs organisation-wide hr.payroll.prepare.",
    operation_id="hrUpdatePayrollDepartmentSetting",
    responses=ERRORS,
)
async def update_department_setting(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    department_id: Annotated[str, Path(max_length=100)],
    payload: PayrollDepartmentSettingUpdate,
) -> PayrollDepartmentSettingPublic:
    row = await service.update_department_setting(
        session, current_user, department_id, payload.shift_worker_default
    )
    return PayrollDepartmentSettingPublic(
        department_id=row[0], department_name=row[1], shift_worker_default=row[2]
    )
