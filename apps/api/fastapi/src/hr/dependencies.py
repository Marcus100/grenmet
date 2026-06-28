import uuid
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import SessionDep

from .absentee.models import AbsenteeReport
from .dailystatus.models import StatusReport
from .exceptions import (
    AbsenteeReportNotFoundError,
    LeaveRequestNotFoundError,
    PublicHolidayNotFoundError,
    RosterPeriodNotFoundError,
    ShiftSwapNotFoundError,
    StatusReportNotFoundError,
    TimesheetNotFoundError,
    WorkflowInstanceNotFoundError,
    WorkflowTemplateNotFoundError,
)
from .exchange.models import ShiftSwapRequest
from .leave.models import LeaveRequest
from .roster.models import PublicHoliday, RosterPeriod
from .timesheet.models import Timesheet
from .workflow.models import WorkflowInstance, WorkflowTemplate


async def _workflow_instance_dep(
    session: SessionDep, instance_id: uuid.UUID
) -> WorkflowInstance:
    instance = await session.get(WorkflowInstance, instance_id)
    if not instance:
        raise WorkflowInstanceNotFoundError()
    return instance


async def _workflow_template_dep(
    session: SessionDep, template_id: uuid.UUID
) -> WorkflowTemplate:
    template = await session.get(WorkflowTemplate, template_id)
    if not template:
        raise WorkflowTemplateNotFoundError()
    return template


WorkflowInstanceDep = Annotated[WorkflowInstance, Depends(_workflow_instance_dep)]
WorkflowTemplateDep = Annotated[WorkflowTemplate, Depends(_workflow_template_dep)]


async def get_roster_period_or_404(
    *, session: AsyncSession, period_id: uuid.UUID
) -> RosterPeriod:
    period = await session.get(RosterPeriod, period_id)
    if not period:
        raise RosterPeriodNotFoundError()
    return period


async def get_public_holiday_or_404(
    *, session: AsyncSession, holiday_id: uuid.UUID
) -> PublicHoliday:
    holiday = await session.get(PublicHoliday, holiday_id)
    if not holiday:
        raise PublicHolidayNotFoundError()
    return holiday


async def _roster_period_dep(session: SessionDep, period_id: uuid.UUID) -> RosterPeriod:
    return await get_roster_period_or_404(session=session, period_id=period_id)


async def _public_holiday_dep(
    session: SessionDep, holiday_id: uuid.UUID
) -> PublicHoliday:
    return await get_public_holiday_or_404(session=session, holiday_id=holiday_id)


RosterPeriodDep = Annotated[RosterPeriod, Depends(_roster_period_dep)]
PublicHolidayDep = Annotated[PublicHoliday, Depends(_public_holiday_dep)]


async def get_timesheet_or_404(
    *, session: AsyncSession, timesheet_id: uuid.UUID
) -> Timesheet:
    timesheet = await session.get(Timesheet, timesheet_id)
    if not timesheet:
        raise TimesheetNotFoundError()
    return timesheet


async def get_leave_request_or_404(
    *, session: AsyncSession, leave_request_id: uuid.UUID
) -> LeaveRequest:
    leave_request = await session.get(LeaveRequest, leave_request_id)
    if not leave_request:
        raise LeaveRequestNotFoundError()
    return leave_request


async def get_shift_swap_request_or_404(
    *, session: AsyncSession, shift_swap_id: uuid.UUID
) -> ShiftSwapRequest:
    shift_swap_request = await session.get(ShiftSwapRequest, shift_swap_id)
    if not shift_swap_request:
        raise ShiftSwapNotFoundError()
    return shift_swap_request


async def get_status_report_or_404(
    *, session: AsyncSession, report_id: uuid.UUID
) -> StatusReport:
    status_report = await session.get(StatusReport, report_id)
    if not status_report:
        raise StatusReportNotFoundError()
    return status_report


async def get_absentee_report_or_404(
    *, session: AsyncSession, report_id: uuid.UUID
) -> AbsenteeReport:
    absentee_report = await session.get(AbsenteeReport, report_id)
    if not absentee_report:
        raise AbsenteeReportNotFoundError()
    return absentee_report


async def _timesheet_dep(session: SessionDep, timesheet_id: uuid.UUID) -> Timesheet:
    return await get_timesheet_or_404(session=session, timesheet_id=timesheet_id)


async def _leave_request_dep(
    session: SessionDep, leave_request_id: uuid.UUID
) -> LeaveRequest:
    return await get_leave_request_or_404(
        session=session, leave_request_id=leave_request_id
    )


async def _shift_swap_dep(
    session: SessionDep, shift_swap_id: uuid.UUID
) -> ShiftSwapRequest:
    return await get_shift_swap_request_or_404(
        session=session, shift_swap_id=shift_swap_id
    )


async def _status_report_dep(session: SessionDep, report_id: uuid.UUID) -> StatusReport:
    return await get_status_report_or_404(session=session, report_id=report_id)


TimesheetDep = Annotated[Timesheet, Depends(_timesheet_dep)]
LeaveRequestDep = Annotated[LeaveRequest, Depends(_leave_request_dep)]
ShiftSwapDep = Annotated[ShiftSwapRequest, Depends(_shift_swap_dep)]
StatusReportDep = Annotated[StatusReport, Depends(_status_report_dep)]
