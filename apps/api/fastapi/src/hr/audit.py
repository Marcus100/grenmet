"""HR's change-history registrations: tracked models, sensitive fields, read checks.

Each read check answers "may this actor read the record?" the same way the owning
module does: the record's subject(s), holders of the module's department-read or
action permission scoped to that subject, and anyone named on its approval chain.
"""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.audit.registry import parse_uuid
from src.auth.models import User
from src.auth.policy import can_act_on_user, has_permission
from src.exceptions import AppException
from src.orm import Base

from .absentee.models import AbsenteeReport
from .calendar.models import CalendarEvent
from .dailystatus.models import StatusReport
from .documents.models import EmployeeDocument
from .exchange.models import ShiftSwapRequest
from .leave.models import LeaveRequest
from .models import (
    ApprovalAuthority,
    Department,
    EmploymentRecord,
    Grade,
    UserAddress,
    UserProfile,
)
from .organisations import permitted_departments
from .parking.models import ParkingPermit
from .roster.models import PublicHoliday
from .timesheet.models import Timesheet, TimesheetEntry
from .training.models import TrainingRecord
from .workflow.models import (
    WorkflowInstance,
    WorkflowStepInstance,
    WorkflowStepTemplate,
    WorkflowTemplate,
)


async def _scoped_to_any(
    session: AsyncSession, actor: User, owners: list[uuid.UUID], keys: tuple[str, ...]
) -> bool:
    if actor.id in owners:
        return True
    for owner in owners:
        for key in keys:
            if await can_act_on_user(
                session=session,
                current_user=actor,
                target_user_id=owner,
                permission_key=key,
            ):
                return True
    return False


async def _on_approval_chain(
    session: AsyncSession, actor: User, entity_id: uuid.UUID
) -> bool:
    step = await session.scalar(
        select(WorkflowStepInstance.id)
        .join(
            WorkflowInstance,
            WorkflowInstance.id == WorkflowStepInstance.workflow_instance_id,
        )
        .where(
            WorkflowInstance.entity_id == entity_id,
            or_(
                WorkflowStepInstance.approver_user_id == actor.id,
                WorkflowStepInstance.required_user_id == actor.id,
            ),
        )
        .limit(1)
    )
    return step is not None


def _owned(
    model: type[Base], owner_attrs: tuple[str, ...], keys: tuple[str, ...]
) -> registry.ReadCheck:
    async def check(session: AsyncSession, actor: User, entity_id: str) -> bool:
        record_id = parse_uuid(entity_id)
        if record_id is None:
            return False
        record = await session.get(model, record_id)
        if record is None:
            return False
        owners = [
            owner
            for owner in (getattr(record, attr) for attr in owner_attrs)
            if owner is not None
        ]
        if await _scoped_to_any(session, actor, owners, keys):
            return True
        return await _on_approval_chain(session, actor, record_id)

    return check


def _permission(key: str) -> registry.ReadCheck:
    async def check(session: AsyncSession, actor: User, entity_id: str) -> bool:  # noqa: ARG001
        return has_permission(current_user=actor, permission_key=key)

    return check


def _department_permission(
    model: type[Base], key: str, *, uuid_id: bool = False
) -> registry.ReadCheck:
    async def check(session: AsyncSession, actor: User, entity_id: str) -> bool:
        record_id = parse_uuid(entity_id) if uuid_id else entity_id
        if record_id is None:
            return False
        record = await session.get(model, record_id)
        if record is None:
            return False
        department_id = getattr(
            record, "id" if model is Department else "department_id"
        )
        department = await session.get(Department, department_id)
        if department is None:
            return False
        permitted = await permitted_departments(
            session, actor, department.organisation_id, key
        )
        return department_id in permitted

    return check


async def _employee(session: AsyncSession, actor: User, entity_id: str) -> bool:
    user_id = parse_uuid(entity_id)
    if user_id is None:
        return False
    return await _scoped_to_any(session, actor, [user_id], ("hr.employment.manage",))


async def _document(session: AsyncSession, actor: User, entity_id: str) -> bool:
    from .documents.service import ensure_can_read

    document_id = parse_uuid(entity_id)
    document = await session.get(EmployeeDocument, document_id) if document_id else None
    if document is None:
        return False
    try:
        await ensure_can_read(session=session, current_user=actor, document=document)
    except AppException:
        return False
    return True


def register() -> None:
    # Employee record: profile, address, employment and approval authority all
    # read as one history under the person's user id.
    registry.register_entity("employee", _employee)
    registry.track(
        UserProfile,
        record_type="user_profile",
        entity_type="employee",
        entity_id_attr="user_id",
        label="Profile",
        sensitive=(
            "phone",
            "date_of_birth",
            "emergency_contact_name",
            "emergency_contact_phone",
            "emergency_contact_relationship",
        ),
    )
    registry.track(
        UserAddress,
        record_type="user_address",
        entity_type="employee",
        entity_id_attr="user_id",
        label="Address",
        sensitive=("line_1", "line_2", "city", "parish", "postal_code"),
    )
    registry.track(
        EmploymentRecord,
        record_type="employment_record",
        entity_type="employee",
        entity_id_attr="user_id",
        label="Employment",
    )
    registry.track(
        ApprovalAuthority,
        record_type="approval_authority",
        entity_type="employee",
        entity_id_attr="user_id",
        label="Approval authority",
    )

    registry.register_entity(
        "leave_request",
        _owned(LeaveRequest, ("user_id",), ("leave.request.action",)),
    )
    registry.track(
        LeaveRequest,
        record_type="leave_request",
        label="Leave request",
        sensitive=("reason", "contact_phone", "leave_address"),
    )

    registry.register_entity(
        "absentee_report",
        _owned(AbsenteeReport, ("user_id",), ("absentee.report.read.department",)),
    )
    registry.track(
        AbsenteeReport,
        record_type="absentee_report",
        label="Absentee report",
        sensitive=("reason", "notes"),
    )

    registry.register_entity(
        "shift_swap",
        _owned(
            ShiftSwapRequest,
            ("requesting_user_id", "counterpart_user_id"),
            ("shift_swap.request.action",),
        ),
    )
    registry.track(ShiftSwapRequest, record_type="shift_swap", label="Shift exchange")

    registry.register_entity(
        "status_report",
        _owned(StatusReport, ("submitted_by_user_id",), ("status.report.read",)),
    )
    registry.track(
        StatusReport, record_type="status_report", label="Daily status report"
    )

    registry.register_entity(
        "timesheet",
        _owned(Timesheet, ("user_id",), ("timesheet.read.department",)),
    )
    registry.track(Timesheet, record_type="timesheet", label="Timesheet")
    registry.track(
        TimesheetEntry,
        record_type="timesheet_entry",
        entity_type="timesheet",
        entity_id_attr="timesheet_id",
        label="Timesheet entry",
        sensitive=("comments",),
    )

    registry.register_entity(
        "parking_permit",
        _owned(
            ParkingPermit,
            ("user_id", "submitted_by_user_id"),
            ("parking.permit.read.department",),
        ),
    )
    registry.track(
        ParkingPermit,
        record_type="parking_permit",
        label="Parking permit",
        sensitive=("phone",),
    )

    registry.register_entity(
        "training_record",
        _owned(
            TrainingRecord,
            ("user_id",),
            ("hr.training.read.department", "hr.training.manage"),
        ),
    )
    registry.track(
        TrainingRecord,
        record_type="training_record",
        label="Training record",
        sensitive=("notes",),
    )

    registry.register_entity("employee_document", _document)
    registry.track(
        EmployeeDocument,
        record_type="employee_document",
        label="Document",
        exclude=("object_key",),
        sensitive=("description",),
    )

    # Setup records: readable by whoever may manage or view that setup area.
    registry.register_entity(
        "department", _department_permission(Department, "hr.employment.manage")
    )
    registry.track(Department, record_type="department", label="Department")
    registry.register_entity(
        "grade", _department_permission(Grade, "hr.employment.manage")
    )
    registry.track(Grade, record_type="grade", label="Grade")
    registry.register_entity(
        "workflow_template",
        _department_permission(
            WorkflowTemplate, "workflow.template.view", uuid_id=True
        ),
    )
    registry.track(
        WorkflowTemplate, record_type="workflow_template", label="Approval workflow"
    )
    registry.track(
        WorkflowStepTemplate,
        record_type="workflow_step_template",
        entity_type="workflow_template",
        entity_id_attr="workflow_template_id",
        label="Approval step",
    )
    registry.register_entity(
        "calendar_event",
        _department_permission(CalendarEvent, "calendar.view", uuid_id=True),
    )
    registry.track(CalendarEvent, record_type="calendar_event", label="Calendar entry")
    registry.register_entity("public_holiday", _permission("calendar.view"))
    registry.track(PublicHoliday, record_type="public_holiday", label="Public holiday")
