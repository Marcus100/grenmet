"""Payroll inputs (slice 1): quantities for HrPlus, never money."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query, Request, Response, status
from fastapi.concurrency import run_in_threadpool

from src.dependencies import CurrentUser, SessionDep, TokenDep
from src.models import ApiError
from src.rate_limit import limiter

from . import deductions, gross, overtime, payslips, service
from .export import safe_filename
from .models import PayItem, PayPeriod
from .schemas import (
    DeductionTypeCreate,
    DeductionTypePublic,
    EmployeeBasicPayCreate,
    EmployeeBasicPayPublic,
    EmployeeBasicPaysPublic,
    EmployeeDeductionCreate,
    EmployeeDeductionPublic,
    EmployeeDeductionsPublic,
    EmployeePayProfilePublic,
    EmployeePayProfilesPublic,
    EmployeePayProfileUpdate,
    MyDeductionsPublic,
    PayCalendarCreate,
    PayCalendarPublic,
    PayCalendarsPublic,
    PayItemPublic,
    PayItemRateCreate,
    PayItemRatePublic,
    PayItemRatesPublic,
    PayItemsPublic,
    PayLineManualCreate,
    PayLinePublic,
    PayLinesPublic,
    PayPeriodAmountsPublic,
    PayPeriodCreate,
    PayPeriodDetail,
    PayPeriodPublic,
    PayPeriodReturn,
    PayPeriodReview,
    PayPeriodsPublic,
    PayrollDepartmentSettingPublic,
    PayrollDepartmentSettingsPublic,
    PayrollDepartmentSettingUpdate,
    PayrollExportSettingsPublic,
    PayrollExportSettingsUpdate,
    PayslipPublic,
    PayslipsPublic,
    PaySummaryPublic,
    SocialInsuranceSchemeCreate,
    SocialInsuranceSchemePublic,
    StatutoryTablesPublic,
    TableStatePublic,
    TableStateUpdate,
    TaxTableCreate,
    TaxTablePublic,
)


async def _no_store(response: Response) -> None:
    """Payroll responses carry personal and pay data: never cache them."""
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    prefix="/hr/payroll", tags=["hr-payroll"], dependencies=[Depends(_no_store)]
)

ERRORS: dict[int | str, dict[str, Any]] = {
    400: {"model": ApiError, "description": "Invalid payroll input"},
    401: {"model": ApiError, "description": "Not signed in"},
    403: {
        "model": ApiError,
        "description": "Missing payroll permission, organisation-wide scope or two-step verification, or separation of duty (you prepared, added lines to, or changed a profile used in the period, or it contains your own pay)",
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
    view = data.pop("view")
    assert isinstance(view, tuple)
    return PayPeriodDetail.model_validate(
        {
            **data,
            "period": _period(view),
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
    description="Status, totals per pay item (quantities only, never money) and the actions the caller may take. Totals cover only the departments the caller may read.",
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
    description="Needs organisation-wide hr.payroll.approve, a session verified with two-step verification, and the approval stage; never someone who submitted the period, added lines to it, has their own pay in it, or changed a pay profile or shift-worker default it relies on. The final approval locks the period.",
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
    description="Needs organisation-wide hr.payroll.approve and a reason; never someone who submitted the period, added lines to it, has their own pay in it, or changed a pay profile or shift-worker default it relies on. The period reopens for changes.",
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


# ── Slice 2: gross pay. Organisation-wide hr.payroll.read.amounts only. ───────


@router.get(
    "/periods/{period_id}/amounts",
    response_model=PayPeriodAmountsPublic,
    status_code=status.HTTP_200_OK,
    summary="Read a pay period's gross amounts",
    description="Amounts in minor units per line and per employee. Needs organisation-wide hr.payroll.read.amounts; department readers never receive amounts.",
    operation_id="hrGetPayPeriodAmounts",
    responses=ERRORS,
)
async def read_period_amounts(
    *, session: SessionDep, current_user: CurrentUser, period_id: uuid.UUID
) -> PayPeriodAmountsPublic:
    data = await gross.list_amounts(session, current_user, period_id)
    return PayPeriodAmountsPublic.model_validate(data)


@router.get(
    "/rates",
    response_model=PayItemRatesPublic,
    status_code=status.HTTP_200_OK,
    summary="List pay item rates",
    description="Dated multipliers and fixed amounts. Needs organisation-wide hr.payroll.read.amounts or hr.payroll.rates.manage.",
    operation_id="hrListPayItemRates",
    responses=ERRORS,
)
async def list_rates(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: Annotated[str, Query(max_length=100)],
) -> PayItemRatesPublic:
    rows = await gross.list_rates(session, current_user, organisation_id)
    return PayItemRatesPublic(
        data=[PayItemRatePublic.model_validate(r, from_attributes=True) for r in rows]
    )


@router.post(
    "/rates",
    response_model=PayItemRatePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a dated pay item rate",
    description="Needs organisation-wide hr.payroll.rates.manage and a session verified with two-step verification. An open-ended earlier rate ends the day before.",
    operation_id="hrCreatePayItemRate",
    responses=ERRORS,
)
async def create_rate(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    payload: PayItemRateCreate,
) -> PayItemRatePublic:
    rate = await gross.create_rate(session, current_user, payload, token=token)
    return PayItemRatePublic.model_validate(rate, from_attributes=True)


def _basic_public(row: Any, name: str) -> EmployeeBasicPayPublic:
    return EmployeeBasicPayPublic.model_validate(
        {
            **{
                column: getattr(row, column)
                for column in EmployeeBasicPayPublic.model_fields
                if column != "employee_name"
            },
            "employee_name": name,
        }
    )


@router.get(
    "/basic-pay",
    response_model=EmployeeBasicPaysPublic,
    status_code=status.HTTP_200_OK,
    summary="List dated basic pay",
    description="Needs organisation-wide hr.payroll.read.amounts or hr.payroll.rates.manage.",
    operation_id="hrListEmployeeBasicPay",
    responses=ERRORS,
)
async def list_basic_pay(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: Annotated[str, Query(max_length=100)],
    user_id: uuid.UUID | None = None,
) -> EmployeeBasicPaysPublic:
    rows = await gross.list_basic_pay(session, current_user, organisation_id, user_id)
    return EmployeeBasicPaysPublic(data=[_basic_public(r, n) for r, n in rows])


@router.post(
    "/basic-pay",
    response_model=EmployeeBasicPayPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Record dated basic pay",
    description="Needs organisation-wide hr.payroll.rates.manage and a session verified with two-step verification. Nobody sets their own. An hourly-paid person on a calendar longer than fortnightly needs an override reason.",
    operation_id="hrCreateEmployeeBasicPay",
    responses=ERRORS,
)
async def create_basic_pay(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    payload: EmployeeBasicPayCreate,
) -> EmployeeBasicPayPublic:
    basic = await gross.create_basic_pay(session, current_user, payload, token=token)
    name = await service.employee_name(session, basic.user_id)
    return _basic_public(basic, name)


# ── Slice 3: deductions. Organisation-wide amounts, approval or rates keys. ───

TableKind = Annotated[str, Path(pattern="^(tax|social-insurance|deduction)$")]


@router.get(
    "/periods/{period_id}/pay-summary",
    response_model=PaySummaryPublic,
    status_code=status.HTTP_200_OK,
    summary="Preview gross, deductions and net pay",
    description="Per employee. Needs organisation-wide hr.payroll.read.amounts. Marked 'Provisional figures' while an income tax or social insurance table used is provisional.",
    operation_id="hrGetPayPeriodSummary",
    responses=ERRORS,
)
async def read_pay_summary(
    *, session: SessionDep, current_user: CurrentUser, period_id: uuid.UUID
) -> PaySummaryPublic:
    return PaySummaryPublic.model_validate(
        await deductions.pay_summary(session, current_user, period_id)
    )


@router.post(
    "/periods/{period_id}/issue-approval",
    response_model=PayPeriodDetail,
    status_code=status.HTTP_200_OK,
    summary="Approve a pay period's money figures for issue",
    description="Needs organisation-wide hr.payroll.approve and two-step verification; never the preparer. Refused (409) while an income tax or social insurance table used is provisional, or a line is unpriced.",
    operation_id="hrApprovePayPeriodForIssue",
    responses=ERRORS,
)
async def approve_for_issue(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    period_id: uuid.UUID,
) -> PayPeriodDetail:
    await deductions.approve_for_issue(session, current_user, period_id, token=token)
    return await _detail(session, current_user, period_id)


@router.post(
    "/periods/{period_id}/table-state-refresh",
    response_model=PayPeriodDetail,
    status_code=status.HTTP_200_OK,
    summary="Refresh a period's table states before issue",
    description="After a table is confirmed, copies the current state of each table onto an approved period's deduction lines (state only, no figures change) so it can be approved for issue. Audited. Needs organisation-wide hr.payroll.approve and two-step verification; never someone excluded from approving the period; only before issue approval.",
    operation_id="hrRefreshPayPeriodTableState",
    responses=ERRORS,
)
async def refresh_table_state(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    period_id: uuid.UUID,
) -> PayPeriodDetail:
    await deductions.refresh_table_state(session, current_user, period_id, token=token)
    return await _detail(session, current_user, period_id)


@router.get(
    "/statutory-tables",
    response_model=StatutoryTablesPublic,
    status_code=status.HTTP_200_OK,
    summary="List tax, social insurance and deduction tables",
    description="Dated tables with their rule state and source. Needs organisation-wide hr.payroll.read.amounts or hr.payroll.rates.manage.",
    operation_id="hrListStatutoryTables",
    responses=ERRORS,
)
async def list_statutory_tables(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: Annotated[str, Query(max_length=100)],
) -> StatutoryTablesPublic:
    return StatutoryTablesPublic.model_validate(
        await deductions.list_tables(session, current_user, organisation_id)
    )


@router.post(
    "/tax-tables",
    response_model=TaxTablePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a dated income tax table",
    description="Annual allowance and bands (the last band has no limit). Needs organisation-wide hr.payroll.rates.manage and two-step verification.",
    operation_id="hrCreateTaxTable",
    responses=ERRORS,
)
async def create_tax_table(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    payload: TaxTableCreate,
) -> TaxTablePublic:
    table = await deductions.create_tax_table(
        session, current_user, payload, token=token
    )
    data = await deductions.list_tables(session, current_user, table.organisation_id)
    return TaxTablePublic.model_validate(
        next(t for t in data["tax_tables"] if t["id"] == table.id)
    )


@router.post(
    "/social-insurance-schemes",
    response_model=SocialInsuranceSchemePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a dated social insurance scheme",
    description="Employee and employer rates with monthly and weekly insurable ceilings. Needs organisation-wide hr.payroll.rates.manage and two-step verification.",
    operation_id="hrCreateSocialInsuranceScheme",
    responses=ERRORS,
)
async def create_scheme(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    payload: SocialInsuranceSchemeCreate,
) -> SocialInsuranceSchemePublic:
    scheme = await deductions.create_scheme(session, current_user, payload, token=token)
    return SocialInsuranceSchemePublic.model_validate(scheme, from_attributes=True)


@router.post(
    "/deduction-types",
    response_model=DeductionTypePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a dated deduction type",
    description="Percentage of basic or gross, fixed, or a split premium; may require the employee's authorisation. Needs organisation-wide hr.payroll.rates.manage and two-step verification.",
    operation_id="hrCreateDeductionType",
    responses=ERRORS,
)
async def create_deduction_type(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    payload: DeductionTypeCreate,
) -> DeductionTypePublic:
    kind = await deductions.create_deduction_type(
        session, current_user, payload, token=token
    )
    return DeductionTypePublic.model_validate(kind, from_attributes=True)


@router.put(
    "/statutory-tables/{kind}/{table_id}/state",
    response_model=TableStatePublic,
    status_code=status.HTTP_200_OK,
    summary="Confirm or reopen a table",
    description="Sets PROVISIONAL, OWNER_CONFIRMED or CONFIRMED with a note, recorded in the change history. Needs organisation-wide hr.payroll.tables.confirm and two-step verification; never the table's creator.",
    operation_id="hrSetStatutoryTableState",
    responses=ERRORS,
)
async def set_table_state(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    kind: TableKind,
    table_id: uuid.UUID,
    payload: TableStateUpdate,
) -> TableStatePublic:
    record = await deductions.set_table_state(
        session, current_user, kind, table_id, payload, token=token
    )
    return TableStatePublic(
        id=record.id, rule_state=record.rule_state, source_note=record.source_note
    )


@router.get(
    "/employee-deductions",
    response_model=EmployeeDeductionsPublic,
    status_code=status.HTTP_200_OK,
    summary="List employee deduction enrolments",
    description="Needs organisation-wide hr.payroll.read.amounts or hr.payroll.rates.manage.",
    operation_id="hrListEmployeeDeductions",
    responses=ERRORS,
)
async def list_employee_deductions(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: Annotated[str, Query(max_length=100)],
    user_id: uuid.UUID | None = None,
) -> EmployeeDeductionsPublic:
    rows = await deductions.list_employee_deductions(
        session, current_user, organisation_id, user_id
    )
    return EmployeeDeductionsPublic(
        data=[
            EmployeeDeductionPublic.model_validate(r, from_attributes=True)
            for r in rows
        ]
    )


@router.post(
    "/employee-deductions",
    response_model=EmployeeDeductionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Enrol an employee in a deduction",
    description="A deduction that requires authorisation is only taken once its authorisation reference is recorded. Needs organisation-wide hr.payroll.rates.manage and two-step verification.",
    operation_id="hrCreateEmployeeDeduction",
    responses=ERRORS,
)
async def create_employee_deduction(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    payload: EmployeeDeductionCreate,
) -> EmployeeDeductionPublic:
    row = await deductions.create_employee_deduction(
        session, current_user, payload, token=token
    )
    return EmployeeDeductionPublic.model_validate(row, from_attributes=True)


@router.get(
    "/me/deductions",
    response_model=MyDeductionsPublic,
    status_code=status.HTTP_200_OK,
    summary="List my deductions",
    description="Deductions set up for the caller, and whether they have confirmed each. Needs hr.payroll.read.self.",
    operation_id="hrListMyDeductions",
    responses=ERRORS,
)
async def list_my_deductions(
    *, session: SessionDep, current_user: CurrentUser
) -> MyDeductionsPublic:
    return MyDeductionsPublic.model_validate(
        {"data": await deductions.my_deductions(session, current_user)}
    )


@router.post(
    "/me/deductions/{deduction_id}/confirmation",
    response_model=MyDeductionsPublic,
    status_code=status.HTTP_200_OK,
    summary="Confirm a deduction set up for me",
    description="The employee confirms a deduction whose signed authorisation HR has recorded; it is not deducted before this. Needs hr.payroll.read.self.",
    operation_id="hrConfirmMyDeduction",
    responses=ERRORS,
)
async def confirm_my_deduction(
    *, session: SessionDep, current_user: CurrentUser, deduction_id: uuid.UUID
) -> MyDeductionsPublic:
    return MyDeductionsPublic.model_validate(
        {
            "data": await deductions.confirm_my_deduction(
                session, current_user, deduction_id
            )
        }
    )


# ── Slice 4: payslips, bank and GL files ────────────────────────────────────


def _payslip(row: Any) -> PayslipPublic:
    snap = row.snapshot
    return PayslipPublic(
        id=row.id,
        period_id=row.period_id,
        user_id=row.user_id,
        period_start=snap["period_start"],
        period_end=snap["period_end"],
        employee_name=snap["employee_name"],
        net_minor=row.net_minor,
        currency=snap["currency"],
        sha256=row.sha256,
        issued_at=row.issued_at,
    )


@router.get(
    "/me/payslips",
    response_model=PayslipsPublic,
    status_code=status.HTTP_200_OK,
    summary="List my payslips",
    description="The caller's own issued payslips. Needs hr.payroll.read.self and a session verified with two-step verification.",
    operation_id="hrListMyPayslips",
    responses=ERRORS,
)
async def list_my_payslips(
    *, session: SessionDep, current_user: CurrentUser, token: TokenDep
) -> PayslipsPublic:
    rows = await payslips.my_payslips(session, current_user, token=token)
    return PayslipsPublic(data=[_payslip(r) for r in rows])


@router.get(
    "/periods/{period_id}/payslips",
    response_model=PayslipsPublic,
    status_code=status.HTTP_200_OK,
    summary="List a period's payslips",
    description="Needs organisation-wide hr.payroll.read.amounts and a session verified with two-step verification.",
    operation_id="hrListPeriodPayslips",
    responses=ERRORS,
)
async def list_period_payslips(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    period_id: uuid.UUID,
) -> PayslipsPublic:
    rows = await payslips.period_payslips(session, current_user, period_id, token=token)
    return PayslipsPublic(data=[_payslip(r) for r in rows])


@router.get(
    "/payslips/{payslip_id}/pdf",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Download a payslip PDF",
    description="Rendered by WeasyPrint from the frozen snapshot after its SHA-256 is checked. Own payslip with hr.payroll.read.self, or organisation-wide hr.payroll.read.amounts; both need two-step verification. Rate limited.",
    operation_id="hrGetPayslipPdf",
    responses={
        **ERRORS,
        200: {
            "description": "Payslip PDF",
            "content": {
                "application/pdf": {"schema": {"type": "string", "format": "binary"}}
            },
        },
    },
)
@limiter.limit("20/minute")
async def download_payslip_pdf(
    *,
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    payslip_id: uuid.UUID,
) -> Response:
    del request  # the rate limiter keys on it
    slip = await payslips.readable_payslip(
        session, current_user, payslip_id, token=token
    )
    payslips.verify(slip)
    document = await run_in_threadpool(payslips.render_pdf, slip.snapshot, slip.sha256)
    return Response(
        content=document,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename="
            + f'"{safe_filename(f"payslip-{slip.snapshot['period_start']}.pdf")}"',
            "Cache-Control": "no-store",
            "X-Payslip-SHA256": slip.sha256,
        },
    )


@router.post(
    "/periods/{period_id}/bank-transfer.csv",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Export the bank-transfer file",
    description="Net pay per payslip in the organisation's configured columns. Bank account numbers are not stored, so that column reads NOT STORED. Needs organisation-wide hr.payroll.export and two-step verification; audited.",
    operation_id="hrExportBankTransferCsv",
    responses={
        **ERRORS,
        200: {
            "description": "Bank CSV",
            "content": {"text/csv": {"schema": {"type": "string"}}},
        },
    },
)
async def export_bank_csv(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    period_id: uuid.UUID,
) -> Response:
    name, content = await payslips.bank_csv(
        session, current_user, period_id, token=token
    )
    return _csv(name, content)


@router.post(
    "/periods/{period_id}/gl-journal.csv",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Export the GL journal",
    description="A balanced journal per department with the organisation's account codes (UNMAPPED where none is set). Needs organisation-wide hr.payroll.export and two-step verification; audited.",
    operation_id="hrExportGlJournalCsv",
    responses={
        **ERRORS,
        200: {
            "description": "GL CSV",
            "content": {"text/csv": {"schema": {"type": "string"}}},
        },
    },
)
async def export_gl_csv(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    period_id: uuid.UUID,
) -> Response:
    name, content = await payslips.gl_csv(session, current_user, period_id, token=token)
    return _csv(name, content)


def _csv(name: str, content: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/export-settings",
    response_model=PayrollExportSettingsPublic,
    status_code=status.HTTP_200_OK,
    summary="Read bank and GL export settings",
    description="Needs organisation-wide hr.payroll.export.",
    operation_id="hrGetPayrollExportSettings",
    responses=ERRORS,
)
async def read_export_settings(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: Annotated[str, Query(max_length=100)],
) -> PayrollExportSettingsPublic:
    return PayrollExportSettingsPublic.model_validate(
        await payslips.read_settings(session, current_user, organisation_id)
    )


@router.put(
    "/export-settings",
    response_model=PayrollExportSettingsPublic,
    status_code=status.HTTP_200_OK,
    summary="Set bank and GL export settings",
    description="Bank columns from the available list and GL account codes. Needs organisation-wide hr.payroll.rates.manage and two-step verification.",
    operation_id="hrUpdatePayrollExportSettings",
    responses=ERRORS,
)
async def update_export_settings(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    token: TokenDep,
    payload: PayrollExportSettingsUpdate,
) -> PayrollExportSettingsPublic:
    return PayrollExportSettingsPublic.model_validate(
        await payslips.save_settings(
            session,
            current_user,
            payload.organisation_id,
            payload.bank_columns,
            payload.gl_accounts,
            token=token,
        )
    )
