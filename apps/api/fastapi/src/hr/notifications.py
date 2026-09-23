"""HR's notification events, approval-workflow hooks and daily reminder sweeps.

Email bodies carry only a summary (type, person, dates): reasons, medical detail,
approver comments and restricted document titles stay behind the login.
"""

import logging
import uuid
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope, User, UserRoleAssignment
from src.notifications import events
from src.notifications import service as notification_service
from src.notifications.events import EventDef
from src.utils.datetime import utc_now

from .absentee.models import AbsenteeReport
from .dailystatus.models import StatusReport
from .documents.models import DocumentSensitivity, EmployeeDocument
from .exchange.models import ShiftSwapRequest
from .leave.models import LeaveRequest
from .models import Department, EmploymentRecord
from .parking.models import ParkingPermit
from .roster.models import RosterPeriod
from .timesheet.models import Timesheet
from .training.models import TrainingRecord
from .workflow.models import (
    ApprovalActionLog,
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
    WorkflowType,
)

logger = logging.getLogger(__name__)

GRENADA = ZoneInfo("America/Grenada")

REQUEST_TYPE_LABELS: dict[WorkflowType, str] = {
    WorkflowType.LEAVE_REQUEST: "Leave request",
    WorkflowType.SHIFT_SWAP: "Shift exchange",
    WorkflowType.ABSENTEE_REPORT: "Absentee report",
    WorkflowType.STATUS_REPORT: "Daily status report",
    WorkflowType.TIMESHEET: "Timesheet",
    WorkflowType.PARKING_PERMIT: "Parking permit",
}

# Where the requester follows up on their own request in gaa-admin.
REQUESTER_LINKS: dict[str, str] = {
    "leave_request": "/hr/leave",
    "absentee_report": "/hr/absentee",
    "shift_swap": "/hr/shift",
    "status_report": "/hr/status",
    "timesheet": "/hr/timesheet",
    "parking_permit": "/hr/parking",
}
APPROVALS_LINK = "/hr/approvals"

REQUEST_VARIABLES = ("request_type", "requester_name", "department", "summary")


def _day(value: date | datetime | None) -> str:
    return value.strftime("%d %b %Y") if value else ""


def today() -> date:
    return datetime.now(GRENADA).date()


def register() -> None:
    for event in (
        EventDef(
            key="workflow.step_awaiting",
            label="Approval waiting for you",
            description="A request has reached a step you can approve.",
            audience="The approvers of the request's current step",
            title="{{ request_type }} waiting for your approval",
            body="{{ requester_name }} — {{ summary }}",
            variables=REQUEST_VARIABLES,
            email_mutable=False,
        ),
        EventDef(
            key="workflow.approved",
            label="Your request was approved",
            description="Your request completed its approval chain.",
            audience="The person who made the request",
            title="Your {{ request_type | lower }} was approved",
            body="{{ summary }}",
            variables=REQUEST_VARIABLES,
        ),
        EventDef(
            key="workflow.rejected",
            label="Your request was not approved",
            description="An approver rejected your request.",
            audience="The person who made the request",
            title="Your {{ request_type | lower }} was not approved",
            body="{{ summary }}. Open the portal to see the decision.",
            variables=REQUEST_VARIABLES,
        ),
        EventDef(
            key="workflow.returned",
            label="Your request was returned",
            description="An approver sent your request back for changes.",
            audience="The person who made the request",
            title="Your {{ request_type | lower }} was returned for changes",
            body="{{ summary }}. Open the portal to update and resubmit it.",
            variables=REQUEST_VARIABLES,
        ),
        EventDef(
            key="workflow.cancelled",
            label="Request cancelled",
            description="A request was cancelled during approval.",
            audience="The requester and the remaining approvers",
            title="{{ request_type }} cancelled",
            body="{{ requester_name }} — {{ summary }}",
            variables=REQUEST_VARIABLES,
        ),
        EventDef(
            key="workflow.final_approved_hr",
            label="Approved request for HR records",
            description="A request was fully approved; HR records it.",
            audience="HR (configurable roles)",
            title="Approved: {{ request_type }} — {{ requester_name }}",
            body="{{ summary }}. No action needed; this is a record notification.",
            variables=REQUEST_VARIABLES,
            default_roles=("hr-admin",),
        ),
        EventDef(
            key="workflow.step_overdue",
            label="Approval reminder",
            description="A request has waited too long for your approval.",
            audience="The approvers of the waiting step",
            title="Reminder: {{ request_type }} waiting {{ days_waiting }} days",
            body="{{ requester_name }} — {{ summary }}",
            variables=(*REQUEST_VARIABLES, "days_waiting", "step_label"),
            email_mutable=False,
            default_params={"remind_after_days": 2},
        ),
        EventDef(
            key="workflow.step_escalated",
            label="Overdue approval escalation",
            description="An approval has been waiting past the escalation limit.",
            audience="The approvers' supervisors and HR (configurable roles)",
            title="Overdue approval: {{ request_type }} for {{ requester_name }}",
            body="Waiting {{ days_waiting }} days at “{{ step_label }}”. {{ summary }}",
            variables=(*REQUEST_VARIABLES, "days_waiting", "step_label"),
            default_roles=("hr-admin",),
            default_params={"escalate_after_days": 5},
        ),
        EventDef(
            key="exchange.requested",
            label="Shift exchange with you",
            description="A colleague asked to exchange a shift with you.",
            audience="The colleague named on the exchange",
            title="{{ requester_name }} asked to exchange a shift with you",
            body="{{ summary }}",
            variables=REQUEST_VARIABLES,
        ),
        EventDef(
            key="leave.acting_appointment",
            label="Acting appointment",
            description="You were named to act for a colleague on approved leave.",
            audience="The acting officer named on the leave request",
            title="You are acting for {{ requester_name }}",
            body="{{ start_date }} to {{ end_date }}.",
            variables=("requester_name", "start_date", "end_date"),
        ),
        EventDef(
            key="roster.published",
            label="Roster published",
            description="A duty roster you are on was published.",
            audience="Staff with shifts on the roster",
            title="{{ department }} roster published",
            body="Your shifts for {{ period }} are available.",
            variables=("department", "period"),
        ),
        EventDef(
            key="document.expiring",
            label="Document expiring",
            description="An employee document is close to its expiry date.",
            audience="The employee and HR (configurable roles)",
            title="{{ document_title }} expires on {{ expiry_date }}",
            body="{{ employee_name }} — {{ days_left }} days left.",
            variables=("document_title", "employee_name", "expiry_date", "days_left"),
            default_roles=("hr-admin",),
            default_params={"expiry_days_before": [30, 7]},
        ),
        EventDef(
            key="training.expiring",
            label="Training certificate expiring",
            description="A training certificate is close to its expiry date.",
            audience="The employee and HR (configurable roles)",
            title="{{ course_name }} expires on {{ expiry_date }}",
            body="{{ employee_name }} — {{ days_left }} days left.",
            variables=("course_name", "employee_name", "expiry_date", "days_left"),
            default_roles=("hr-admin",),
            default_params={"expiry_days_before": [30, 7]},
        ),
        EventDef(
            key="parking.insurance_expiring",
            label="Vehicle insurance expiring",
            description="Insurance for a vehicle with a parking decal is expiring.",
            audience="The permit holder and HR (configurable roles)",
            title="Vehicle insurance expires on {{ expiry_date }}",
            body="{{ employee_name }} — parking permit {{ decal_number }}, {{ days_left }} days left.",
            variables=("employee_name", "decal_number", "expiry_date", "days_left"),
            default_roles=("hr-admin",),
            default_params={"expiry_days_before": [30, 7]},
        ),
    ):
        events.register(event)
    for sweep in (
        sweep_overdue_approvals,
        sweep_document_expiry,
        sweep_training_expiry,
        sweep_parking_insurance,
    ):
        events.register_sweep(sweep)


# ── Approval workflow ─────────────────────────────────────────────────────────


async def _organisation_id(session: AsyncSession, department_id: str) -> str | None:
    organisation_id: str | None = await session.scalar(
        select(Department.organisation_id).where(Department.id == department_id)
    )
    return organisation_id


async def _name(session: AsyncSession, user_id: uuid.UUID | None) -> str:
    user = await session.get(User, user_id) if user_id else None
    return (user.full_name or user.email) if user else "A staff member"


async def _summary(session: AsyncSession, instance: WorkflowInstance) -> str:
    entity_id = instance.entity_id
    match instance.entity_type:
        case "leave_request":
            leave = await session.get(LeaveRequest, entity_id)
            if leave:
                kind = leave.leave_type.value.replace("_", " ").capitalize()
                return f"{kind}, {_day(leave.start_date)} to {_day(leave.end_date)}"
        case "absentee_report":
            report = await session.get(AbsenteeReport, entity_id)
            if report:
                return f"Absence on {_day(report.report_date)}"
        case "shift_swap":
            swap = await session.get(ShiftSwapRequest, entity_id)
            if swap:
                return (
                    f"{swap.source_shift_code} on {_day(swap.source_date)} for "
                    f"{swap.target_shift_code} on {_day(swap.target_date)}"
                )
        case "status_report":
            status_report = await session.get(StatusReport, entity_id)
            if status_report:
                return f"Report for {_day(status_report.report_date)}"
        case "timesheet":
            timesheet = await session.get(Timesheet, entity_id)
            if timesheet:
                return f"{_day(timesheet.period_start)} to {_day(timesheet.period_end)}"
        case "parking_permit":
            return "Parking decal application"
    return REQUEST_TYPE_LABELS.get(instance.workflow_type, "Request")


async def _context(session: AsyncSession, instance: WorkflowInstance) -> dict[str, Any]:
    department = await session.get(Department, instance.department_id)
    return {
        "request_type": REQUEST_TYPE_LABELS.get(
            instance.workflow_type, instance.workflow_type.value
        ),
        "requester_name": await _name(session, instance.requested_by_user_id),
        "department": department.name if department else instance.department_id,
        "summary": await _summary(session, instance),
    }


async def pending_approvers(
    session: AsyncSession, instance: WorkflowInstance
) -> set[uuid.UUID]:
    """People who can act on the instance's current required steps right now.

    Named co-approvers, plus holders of a step's role whose grant covers the
    requester (ALL, their department, or SELF when they are the requester).
    Superusers can act anywhere but are not notified for everything.
    """
    if instance.status != WorkflowStatus.PENDING:
        return set()
    steps = list(
        (
            await session.execute(
                select(WorkflowStepInstance).where(
                    WorkflowStepInstance.workflow_instance_id == instance.id,
                    WorkflowStepInstance.step_order == instance.current_step_order,
                    WorkflowStepInstance.is_required.is_(True),
                    WorkflowStepInstance.action.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    approvers = {step.required_user_id for step in steps if step.required_user_id}
    role_ids = {
        step.required_role_id
        for step in steps
        if step.required_user_id is None and step.required_role_id
    }
    if role_ids:
        employment = await session.scalar(
            select(EmploymentRecord).where(
                EmploymentRecord.user_id == instance.requested_by_user_id
            )
        )
        if employment is not None:
            now = utc_now()
            rows = await session.execute(
                select(UserRoleAssignment)
                .join(User, User.id == UserRoleAssignment.user_id)
                .where(
                    UserRoleAssignment.role_id.in_(role_ids),
                    UserRoleAssignment.organisation_id == employment.organisation_id,
                    UserRoleAssignment.effective_from <= now,
                    UserRoleAssignment.effective_to.is_(None)
                    | (UserRoleAssignment.effective_to > now),
                    User.is_active.is_(True),
                )
            )
            for grant in rows.scalars():
                if (
                    grant.scope == RoleAssignmentScope.ALL
                    or (
                        grant.scope == RoleAssignmentScope.DEPARTMENT
                        and grant.department_id == employment.department_id
                    )
                    or (
                        grant.scope == RoleAssignmentScope.SELF
                        and grant.user_id == instance.requested_by_user_id
                    )
                ):
                    approvers.add(grant.user_id)
    if not instance.allow_self_approval:
        approvers.discard(instance.requested_by_user_id)
    return approvers


async def workflow_transitioned(
    session: AsyncSession,
    *,
    instance: WorkflowInstance,
    action: WorkflowAction,
    actor_id: uuid.UUID,
    previous_status: WorkflowStatus,
    previous_order: int,
) -> None:
    """Queue notifications for one approval-workflow action (same transaction)."""
    organisation_id = await _organisation_id(session, instance.department_id)
    context = await _context(session, instance)
    common: dict[str, Any] = {
        "organisation_id": organisation_id,
        "context": context,
        "entity_type": instance.entity_type,
        "entity_id": str(instance.entity_id),
        "department_id": instance.department_id,
        "exclude": (actor_id,),
    }
    requester = (instance.requested_by_user_id,)
    requester_link = REQUESTER_LINKS.get(instance.entity_type, "/hr")

    async def notify(event_key: str, recipients: Any, link: str) -> None:
        await notification_service.notify(
            session,
            event_key=event_key,
            recipients=recipients,
            link_path=link,
            **common,
        )

    status = instance.status
    if action == WorkflowAction.SUBMIT:
        await notify(
            "workflow.step_awaiting",
            await pending_approvers(session, instance),
            APPROVALS_LINK,
        )
        if instance.entity_type == "shift_swap":
            swap = await session.get(ShiftSwapRequest, instance.entity_id)
            if swap:
                await notify(
                    "exchange.requested", (swap.counterpart_user_id,), "/hr/shift"
                )
        return
    if status == previous_status and (
        status != WorkflowStatus.PENDING
        or instance.current_step_order == previous_order
    ):
        return  # Co-approval at the same step, or a non-blocking stage.
    if status == WorkflowStatus.PENDING:
        await notify(
            "workflow.step_awaiting",
            await pending_approvers(session, instance),
            APPROVALS_LINK,
        )
    elif status == WorkflowStatus.APPROVED:
        await notify("workflow.approved", requester, requester_link)
        await notify("workflow.final_approved_hr", (), requester_link)
        if instance.entity_type == "leave_request":
            await _acting_appointment(session, instance, organisation_id, context)
    elif status == WorkflowStatus.REJECTED:
        await notify("workflow.rejected", requester, requester_link)
    elif status == WorkflowStatus.RETURNED:
        await notify("workflow.returned", requester, requester_link)
    elif status == WorkflowStatus.CANCELLED:
        await notify("workflow.cancelled", requester, requester_link)


async def _acting_appointment(
    session: AsyncSession,
    instance: WorkflowInstance,
    organisation_id: str | None,
    context: dict[str, Any],
) -> None:
    leave = await session.get(LeaveRequest, instance.entity_id)
    if (
        not leave
        or not leave.requires_acting_appointment
        or not leave.acting_officer_id
    ):
        return
    await notification_service.notify(
        session,
        event_key="leave.acting_appointment",
        organisation_id=organisation_id,
        recipients=(leave.acting_officer_id,),
        context={
            "requester_name": context["requester_name"],
            "start_date": _day(leave.start_date),
            "end_date": _day(leave.end_date),
        },
        link_path="/hr/leave",
        entity_type="leave_request",
        entity_id=str(leave.id),
    )


async def roster_published(
    session: AsyncSession,
    *,
    period: RosterPeriod,
    recipients: set[uuid.UUID],
    actor_id: uuid.UUID,
) -> None:
    department = await session.get(Department, period.department_id)
    await notification_service.notify(
        session,
        event_key="roster.published",
        organisation_id=department.organisation_id if department else None,
        recipients=recipients,
        context={
            "department": department.name if department else period.department_id,
            "period": f"{_day(period.period_start)} to {_day(period.period_end)}",
        },
        link_path="/roster",
        entity_type="roster_period",
        entity_id=str(period.id),
        exclude=(actor_id,),
    )


# ── Daily sweeps ──────────────────────────────────────────────────────────────


async def sweep_overdue_approvals(session: AsyncSession) -> int:
    """Remind approvers after N days; escalate to their supervisors + HR after M."""
    waiting_since = (
        select(
            ApprovalActionLog.workflow_instance_id,
            func.max(ApprovalActionLog.created_at).label("since"),
        )
        .group_by(ApprovalActionLog.workflow_instance_id)
        .subquery()
    )
    rows = await session.execute(
        select(WorkflowInstance, waiting_since.c.since)
        .join(
            waiting_since, waiting_since.c.workflow_instance_id == WorkflowInstance.id
        )
        .where(WorkflowInstance.status == WorkflowStatus.PENDING)
    )
    now = utc_now()
    notified = 0
    for instance, since in rows.all():
        days = (now - since).days
        organisation_id = await _organisation_id(session, instance.department_id)
        remind = await notification_service.effective_setting(
            session, organisation_id, "workflow.step_overdue"
        )
        escalate = await notification_service.effective_setting(
            session, organisation_id, "workflow.step_escalated"
        )
        remind_after = int(remind.params.get("remind_after_days", 2))
        escalate_after = int(escalate.params.get("escalate_after_days", 5))
        if days < min(remind_after, escalate_after):
            continue
        approvers = await pending_approvers(session, instance)
        step_label = await session.scalar(
            select(WorkflowStepInstance.label)
            .where(
                WorkflowStepInstance.workflow_instance_id == instance.id,
                WorkflowStepInstance.step_order == instance.current_step_order,
            )
            .limit(1)
        )
        context = {
            **await _context(session, instance),
            "days_waiting": days,
            "step_label": step_label or "Approval",
        }
        stamp = f"{instance.id}:{instance.current_step_order}:{since.isoformat()}"
        common: dict[str, Any] = {
            "organisation_id": organisation_id,
            "context": context,
            "entity_type": instance.entity_type,
            "entity_id": str(instance.entity_id),
            "department_id": instance.department_id,
        }
        if days >= remind_after:
            notified += await notification_service.notify(
                session,
                event_key="workflow.step_overdue",
                recipients=approvers,
                link_path=APPROVALS_LINK,
                dedupe_key=f"workflow.step_overdue:{stamp}",
                **common,
            )
        if days >= escalate_after:
            supervisors: set[uuid.UUID] = (
                {
                    supervisor
                    for supervisor in (
                        await session.execute(
                            select(EmploymentRecord.supervisor_id).where(
                                EmploymentRecord.user_id.in_(approvers),
                                EmploymentRecord.supervisor_id.is_not(None),
                            )
                        )
                    )
                    .scalars()
                    .all()
                    if supervisor is not None
                }
                if approvers
                else set()
            )
            notified += await notification_service.notify(
                session,
                event_key="workflow.step_escalated",
                recipients=supervisors - approvers,
                link_path=APPROVALS_LINK,
                dedupe_key=f"workflow.step_escalated:{stamp}",
                **common,
            )
    return notified


def reminder_lead(days_left: int, leads: list[int]) -> int | None:
    """The tightest reminder window ``days_left`` falls in, e.g. 5 → 7 of [30, 7].

    Keying the dedupe on the window sends each reminder once, even when a sweep
    is missed or a date is entered already inside the window.
    """
    if days_left < 0:
        return None
    windows = sorted(lead for lead in leads if lead >= days_left)
    return windows[0] if windows else None


async def _leads(
    session: AsyncSession, organisation_id: str | None, event_key: str
) -> list[int]:
    setting = await notification_service.effective_setting(
        session, organisation_id, event_key
    )
    if not setting.enabled:
        return []
    return [int(day) for day in setting.params.get("expiry_days_before", [])]


async def _department_id(session: AsyncSession, user_id: uuid.UUID) -> str | None:
    department_id: str | None = await session.scalar(
        select(EmploymentRecord.department_id).where(
            EmploymentRecord.user_id == user_id
        )
    )
    return department_id


async def sweep_document_expiry(session: AsyncSession) -> int:
    start = today()
    documents = (
        await session.execute(
            select(EmployeeDocument).where(
                EmployeeDocument.archived_at.is_(None),
                EmployeeDocument.expiry_date.is_not(None),
                EmployeeDocument.expiry_date >= start,
            )
        )
    ).scalars()
    notified = 0
    for document in documents:
        assert document.expiry_date is not None
        days_left = (document.expiry_date - start).days
        lead = reminder_lead(
            days_left,
            await _leads(session, document.organisation_id, "document.expiring"),
        )
        if lead is None:
            continue
        title = (
            "A restricted document"
            if document.sensitivity == DocumentSensitivity.RESTRICTED
            else document.title
        )
        notified += await notification_service.notify(
            session,
            event_key="document.expiring",
            organisation_id=document.organisation_id,
            recipients=(document.user_id,),
            context={
                "document_title": title,
                "employee_name": await _name(session, document.user_id),
                "expiry_date": _day(document.expiry_date),
                "days_left": days_left,
            },
            link_path="/hr/documents",
            entity_type="employee_document",
            entity_id=str(document.id),
            department_id=await _department_id(session, document.user_id),
            dedupe_key=f"document.expiring:{document.id}:{document.expiry_date}:{lead}",
        )
    return notified


async def sweep_training_expiry(session: AsyncSession) -> int:
    start = today()
    records = list(
        (
            await session.execute(
                select(TrainingRecord).where(
                    TrainingRecord.archived_at.is_(None),
                    TrainingRecord.expires_on.is_not(None),
                )
            )
        ).scalars()
    )
    # A renewed course supersedes the old certificate; only remind on the latest.
    latest: dict[tuple[uuid.UUID, str], TrainingRecord] = {}
    for record in records:
        key = (record.user_id, record.course_name.strip().lower())
        current = latest.get(key)
        if current is None or record.completed_on > current.completed_on:
            latest[key] = record
    notified = 0
    for record in latest.values():
        assert record.expires_on is not None
        days_left = (record.expires_on - start).days
        lead = reminder_lead(
            days_left,
            await _leads(session, record.organisation_id, "training.expiring"),
        )
        if lead is None:
            continue
        notified += await notification_service.notify(
            session,
            event_key="training.expiring",
            organisation_id=record.organisation_id,
            recipients=(record.user_id,),
            context={
                "course_name": record.course_name,
                "employee_name": await _name(session, record.user_id),
                "expiry_date": _day(record.expires_on),
                "days_left": days_left,
            },
            link_path="/hr/training",
            entity_type="training_record",
            entity_id=str(record.id),
            department_id=record.department_id,
            dedupe_key=f"training.expiring:{record.id}:{record.expires_on}:{lead}",
        )
    return notified


async def sweep_parking_insurance(session: AsyncSession) -> int:
    start = today()
    permits = (
        await session.execute(
            select(ParkingPermit, Department.organisation_id)
            .join(Department, Department.id == ParkingPermit.department_id)
            .where(
                ParkingPermit.issued_at.is_not(None),
                ParkingPermit.vehicle_insurance_expiry_date.is_not(None),
                ParkingPermit.vehicle_insurance_expiry_date >= start,
            )
        )
    ).all()
    notified = 0
    for permit, organisation_id in permits:
        if permit.valid_to and permit.valid_to < start:
            continue
        expiry = permit.vehicle_insurance_expiry_date
        assert expiry is not None
        days_left = (expiry - start).days
        lead = reminder_lead(
            days_left,
            await _leads(session, organisation_id, "parking.insurance_expiring"),
        )
        if lead is None:
            continue
        notified += await notification_service.notify(
            session,
            event_key="parking.insurance_expiring",
            organisation_id=organisation_id,
            recipients=(permit.user_id,),
            context={
                "employee_name": await _name(session, permit.user_id),
                "decal_number": permit.decal_number or "",
                "expiry_date": _day(expiry),
                "days_left": days_left,
            },
            link_path="/hr/parking",
            entity_type="parking_permit",
            entity_id=str(permit.id),
            department_id=permit.department_id,
            dedupe_key=f"parking.insurance_expiring:{permit.id}:{expiry}:{lead}",
        )
    return notified
