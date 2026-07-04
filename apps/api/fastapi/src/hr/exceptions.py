"""
HR module exceptions.

Domain-specific exceptions that subclass src.exceptions so the existing
app_exception_handler in main.py handles them (no new handler registration).
"""

from src.exceptions import AppException, AuthorizationError, NotFoundError

from . import constants as hr_constants

# --- 404 Not Found ---


class HRProfileNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_HR_PROFILE_NOT_FOUND)


class EmploymentNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_EMPLOYMENT_NOT_FOUND)


class DepartmentNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_DEPARTMENT_NOT_FOUND)


class RosterPeriodNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_ROSTER_PERIOD_NOT_FOUND)


class PublicHolidayNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_PUBLIC_HOLIDAY_NOT_FOUND)


class WorkflowTemplateNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_WORKFLOW_TEMPLATE_NOT_FOUND)


class WorkflowInstanceNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_WORKFLOW_INSTANCE_NOT_FOUND)


class WorkflowStepNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_WORKFLOW_STEP_NOT_FOUND)


class TimesheetNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_TIMESHEET_NOT_FOUND)


class LeaveRequestNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_LEAVE_REQUEST_NOT_FOUND)


class ShiftSwapNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_SHIFT_SWAP_NOT_FOUND)


class StatusReportNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_STATUS_REPORT_NOT_FOUND)


class AbsenteeReportNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_ABSENTEE_REPORT_NOT_FOUND)


class ParkingPermitNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__(hr_constants.ERROR_PARKING_PERMIT_NOT_FOUND)


# --- 403 Forbidden (AuthorizationError with message from constants) ---


class HRPermissionDeniedError(AuthorizationError):
    """Insufficient permission for an HR operation."""

    def __init__(self, message: str) -> None:
        super().__init__(message)


# --- 400 Bad Request (validation / business rule) ---


class HRValidationError(AppException):
    """Validation or business rule failure in HR domain."""

    def __init__(self, message: str) -> None:
        super().__init__(message, 400)
