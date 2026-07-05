"""
HR module constants.

Centralized error messages and codes for the HR domain (profile, roster,
workflow, timesheet, leave, absentee, exchange, dailystatus).
Use these in hr.exceptions and services.
"""

# --- Profile (hr/service.py) ---
ERROR_HR_PROFILE_NOT_FOUND = "HR profile not found for this user"
ERROR_EMPLOYMENT_NOT_FOUND = "Employment record not found for this user"
ERROR_ONLY_SUPERVISOR_OR_ADMIN = "Only supervisors or admins can update employment"
ERROR_SUPERVISOR_CAN_ONLY_MANAGE_DEPARTMENT = (
    "Supervisors can update only users in their department"
)

ERROR_DEPARTMENT_NOT_FOUND = "Department not found"
ERROR_DEPARTMENT_ALREADY_EXISTS = "A department with this id or name already exists"
ERROR_EMPLOYMENT_ALREADY_EXISTS = "An employment record already exists for this user"

# --- Roster (hr/roster/service.py) ---
ERROR_ROSTER_PERIOD_END_BEFORE_START = "period_end must be after period_start"
ERROR_ROSTER_PERIOD_NOT_FOUND = "Roster period not found"
ERROR_CSV_NO_HEADER = "CSV has no header"
ERROR_CSV_MISSING_COLUMNS = (
    "CSV missing columns: {}"  # .format(", ".join(sorted(cols)))
)
ERROR_CSV_IMPORT_INVALID_ROWS = "CSV import has invalid rows"

# --- Public Holidays ---
ERROR_PUBLIC_HOLIDAY_NOT_FOUND = "Public holiday not found"
ERROR_PUBLIC_HOLIDAY_DUPLICATE_DATE = "A public holiday already exists for this date"

# --- Roster Revisions ---
ERROR_ROSTER_PERIOD_ALREADY_PUBLISHED = "Roster period is already published"
ERROR_ROSTER_PERIOD_NOT_PUBLISHED = "Roster period must be published before closing"
ERROR_ROSTER_PERIOD_ALREADY_CLOSED = "Roster period is already closed"

# --- Workflow (hr/workflow/service.py) ---
ERROR_WORKFLOW_TEMPLATE_NOT_FOUND = "Workflow template not found"
ERROR_WORKFLOW_INSTANCE_NOT_FOUND = "Workflow instance not found"
ERROR_WORKFLOW_STEP_NOT_FOUND = "Workflow step not found"
ERROR_WORKFLOW_PERMISSION_DENIED = "Not allowed to perform this workflow action"
ERROR_WORKFLOW_CANNOT_BE_SUBMITTED = "Workflow cannot be submitted"
ERROR_WORKFLOW_NOT_PENDING = "Workflow is not pending"

# --- Timesheet (hr/timesheet/service.py) ---
ERROR_TIMESHEET_SELF_SUBMIT_DISABLED = "Self submission is disabled"
ERROR_TIMESHEET_PROXY_SUBMIT_DISABLED = "Proxy submission is disabled"
ERROR_TIMESHEET_SUBMIT_FOR_USER_NOT_ALLOWED = "Not allowed to submit for this user"
ERROR_TIMESHEET_NOT_FOUND = "Timesheet not found"
ERROR_TIMESHEET_ALREADY_SUBMITTED = "Timesheet already submitted"
ERROR_TIMESHEET_SELF_SUBMIT_ONLY_OWN = "Self submission only for own timesheet"
ERROR_TIMESHEET_PROXY_SUBMIT_NOT_ALLOWED = "Proxy submit not allowed"
ERROR_TIMESHEET_NOT_SUBMITTED = "Timesheet is not submitted"
ERROR_TIMESHEET_APPROVE_NOT_ALLOWED = "Not allowed to approve this timesheet"
ERROR_TIMESHEET_READ_NOT_ALLOWED = "Not allowed to read this timesheet"

# --- Leave / Absentee / Exchange / Daily Status ---
ERROR_LEAVE_REQUEST_NOT_FOUND = "Leave request not found"
ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED = "Not allowed to action this leave request"
ERROR_LEAVE_REQUEST_NOT_DRAFT = "Only a draft leave request can be submitted"
ERROR_SHIFT_SWAP_NOT_FOUND = "Shift swap request not found"
ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED = "Not allowed to action this shift swap"
ERROR_SHIFT_SWAP_NOT_DRAFT = "Only a draft shift swap request can be submitted"
ERROR_STATUS_REPORT_NOT_FOUND = "Status report not found"
ERROR_STATUS_REPORT_ACTION_NOT_ALLOWED = "Not allowed to submit this status report"
ERROR_STATUS_REPORT_NOT_DRAFT = "Only a draft status report can be submitted"
ERROR_ABSENTEE_REPORT_NOT_FOUND = "Absentee report not found"
ERROR_ABSENTEE_REPORT_ACTION_NOT_ALLOWED = "Not allowed to submit this absentee report"
ERROR_ABSENTEE_REPORT_NOT_DRAFT = "Only a draft absentee report can be submitted"
ERROR_ABSENTEE_FILE_FOR_USER_NOT_ALLOWED = (
    "Not allowed to file an absentee report for this user"
)

# --- Parking (hr/parking/service.py) ---
ERROR_PARKING_PERMIT_NOT_FOUND = "Parking permit not found"
ERROR_PARKING_FILE_FOR_USER_NOT_ALLOWED = (
    "Not allowed to file a parking permit application for this user"
)
ERROR_ABSENTEE_REASON_REQUIRES_NOTES = (
    "A written reason is required for uncertified sick or illness on the job"
)
