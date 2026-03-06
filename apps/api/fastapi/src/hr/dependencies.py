import uuid
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

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
)
from .exchange.models import ShiftSwapRequest
from .leave.models import LeaveRequest
from .roster.models import PublicHoliday, RosterPeriod
from .timesheet.models import Timesheet


def get_roster_period_or_404(*, session: Session, period_id: uuid.UUID) -> RosterPeriod:
    period = session.get(RosterPeriod, period_id)
    if not period:
        raise RosterPeriodNotFoundError()
    return period


def get_public_holiday_or_404(
    *, session: Session, holiday_id: uuid.UUID
) -> PublicHoliday:
    holiday = session.get(PublicHoliday, holiday_id)
    if not holiday:
        raise PublicHolidayNotFoundError()
    return holiday


def get_timesheet_or_404(*, session: Session, timesheet_id: uuid.UUID) -> Timesheet:
    timesheet = session.get(Timesheet, timesheet_id)
    if not timesheet:
        raise TimesheetNotFoundError()
    return timesheet


def get_leave_request_or_404(
    *, session: Session, leave_request_id: uuid.UUID
) -> LeaveRequest:
    leave_request = session.get(LeaveRequest, leave_request_id)
    if not leave_request:
        raise LeaveRequestNotFoundError()
    return leave_request


def get_shift_swap_request_or_404(
    *, session: Session, shift_swap_id: uuid.UUID
) -> ShiftSwapRequest:
    shift_swap_request = session.get(ShiftSwapRequest, shift_swap_id)
    if not shift_swap_request:
        raise ShiftSwapNotFoundError()
    return shift_swap_request


def get_status_report_or_404(*, session: Session, report_id: uuid.UUID) -> StatusReport:
    status_report = session.get(StatusReport, report_id)
    if not status_report:
        raise StatusReportNotFoundError()
    return status_report


def get_absentee_report_or_404(
    *, session: Session, report_id: uuid.UUID
) -> AbsenteeReport:
    absentee_report = session.get(AbsenteeReport, report_id)
    if not absentee_report:
        raise AbsenteeReportNotFoundError()
    return absentee_report


def _timesheet_dep(session: SessionDep, timesheet_id: uuid.UUID) -> Timesheet:
    return get_timesheet_or_404(session=session, timesheet_id=timesheet_id)


TimesheetDep = Annotated[Timesheet, Depends(_timesheet_dep)]
