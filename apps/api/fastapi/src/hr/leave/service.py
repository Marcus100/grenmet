import logging
import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr import organisations
from src.hr.constants import (
    ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED,
    ERROR_LEAVE_REQUEST_NOT_DRAFT,
)
from src.hr.dependencies import get_leave_request_or_404
from src.hr.exceptions import (
    HRPermissionDeniedError,
    HRValidationError,
)
from src.hr.models import EDITABLE_STATUSES, EmploymentRecord, RequestStatus
from src.hr.roster.holidays import PROVISIONAL_SOURCE
from src.hr.roster.models import (
    PublicHoliday,
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.signatures import service as signature_service
from src.hr.workflow import service as workflow_service
from src.hr.workflow.models import WorkflowInstance, WorkflowStatus, WorkflowType
from src.hr.workflow.service import start_workflow_for_entity, submit_draft_workflow
from src.utils.datetime import utc_now

from . import ledger
from .models import (
    UNTRACKED_LEAVE_TYPES,
    LeaveEntryKind,
    LeaveRequest,
    LeaveType,
    ProfAppointmentType,
)
from .schemas import (
    LeaveRequestAction,
    LeaveRequestCreate,
    LeaveRequestSubmit,
    WorkingDayHoliday,
    WorkingDaysPublic,
)

logger = logging.getLogger(__name__)


async def validate_acting_officer(
    session: AsyncSession, department_id: str, acting_officer_id: uuid.UUID | None
) -> None:
    if acting_officer_id is None:
        return
    department = await organisations.department_for(session, department_id)
    if not await workflow_service._named_actor_in_organisation(
        session, acting_officer_id, department.organisation_id, allow_superuser=False
    ):
        raise HRValidationError(
            "Acting officer must be an active employee in this organisation"
        )


def validate_leave_fields(
    *,
    start_date: date,
    end_date: date,
    days_requested: Decimal,
    leave_type: LeaveType,
    professional_appointment_subtype: ProfAppointmentType | None,
    reason: str | None,
    travel_from_date: date | None,
    travel_to_date: date | None,
    submitting: bool,
) -> None:
    if end_date < start_date:
        raise HRValidationError("End date must be on or after start date")
    if not days_requested.is_finite() or days_requested < 0:
        raise HRValidationError("Days requested must be a non-negative number")
    if submitting and days_requested <= 0:
        raise HRValidationError("Enter a positive number of days requested")
    if submitting and leave_type == LeaveType.OTHER and not (reason or "").strip():
        raise HRValidationError("State the reason for other leave")
    if submitting and leave_type == LeaveType.JURY_DUTY and not (reason or "").strip():
        raise HRValidationError("Enter the jury summons reference as the reason")
    if (
        submitting
        and leave_type == LeaveType.PROFESSIONAL_APPOINTMENT
        and professional_appointment_subtype is None
    ):
        raise HRValidationError("Choose the professional appointment type")
    if (travel_from_date is None) != (travel_to_date is None):
        raise HRValidationError("Enter both travel dates or leave both blank")
    if travel_from_date and travel_to_date and travel_to_date < travel_from_date:
        raise HRValidationError("Travel to date must be on or after travel from date")


async def preview_leave_request_pdf(
    *, session: AsyncSession, current_user: User, payload: LeaveRequestCreate
) -> bytes:
    """Render an unsaved leave sheet through the signed document renderer."""
    from src.baseline.service import employment_for

    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    employment = await employment_for(session, current_user.id)
    if not employment or employment.department_id != payload.department_id:
        raise HRPermissionDeniedError("Preview is limited to your department")
    await validate_acting_officer(
        session, payload.department_id, payload.acting_officer_id
    )
    validate_leave_fields(
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_requested=payload.days_requested,
        leave_type=payload.leave_type,
        professional_appointment_subtype=payload.professional_appointment_subtype,
        reason=payload.reason,
        travel_from_date=payload.travel_from_date,
        travel_to_date=payload.travel_to_date,
        submitting=False,
    )
    values = payload.model_dump(
        exclude={"as_draft", "signature_version", "co_approver_user_ids"}
    )
    values["user_id"] = current_user.id
    snapshot = await signature_service.build_document_snapshot(
        session=session,
        actor=current_user,
        entity_type="leave_request",
        entity_id="DRAFT",
        department_id=payload.department_id,
        values=values,
        signed_at=None,
    )
    return await run_in_threadpool(signature_service.render_pdf, snapshot, None)


async def create_leave_request(
    *, session: AsyncSession, current_user: User, payload: LeaveRequestCreate
) -> LeaveRequest:
    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    validate_leave_fields(
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_requested=payload.days_requested,
        leave_type=payload.leave_type,
        professional_appointment_subtype=payload.professional_appointment_subtype,
        reason=payload.reason,
        travel_from_date=payload.travel_from_date,
        travel_to_date=payload.travel_to_date,
        submitting=not payload.as_draft,
    )
    from src.baseline.models import StaffCredential
    from src.baseline.service import require_ready

    await validate_acting_officer(
        session, payload.department_id, payload.acting_officer_id
    )
    await require_ready(session, current_user.id, payload.department_id)
    credential = await session.get(StaffCredential, current_user.id)
    if (
        credential is not None
        and payload.leave_type not in UNTRACKED_LEAVE_TYPES
        and not await ledger.has_entry(
            session, current_user.id, payload.leave_type.value
        )
    ):
        raise HRValidationError(
            "An administrator must verify the opening balance for this leave type first"
        )
    leave_request = LeaveRequest(
        user_id=current_user.id,
        department_id=payload.department_id,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_requested=payload.days_requested,
        days_with_pay=payload.days_with_pay,
        days_without_pay=payload.days_without_pay,
        professional_appointment_subtype=payload.professional_appointment_subtype,
        reason=payload.reason,
        contact_phone=payload.contact_phone,
        leave_address=payload.leave_address,
        travel_from_date=payload.travel_from_date,
        travel_to_date=payload.travel_to_date,
        salary_in_advance=payload.salary_in_advance,
        requires_acting_appointment=payload.requires_acting_appointment,
        acting_officer_id=payload.acting_officer_id,
        expected_return_date=payload.expected_return_date,
        status=RequestStatus.DRAFT if payload.as_draft else RequestStatus.SUBMITTED,
    )
    # Flush to obtain the id, then start the workflow and commit once so the
    # request and its workflow instance are persisted atomically.
    session.add(leave_request)
    await session.flush()

    workflow_id = await start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.LEAVE_REQUEST,
        entity_type="leave_request",
        entity_id=leave_request.id,
        co_approver_user_ids=payload.co_approver_user_ids,
        submit=not payload.as_draft,
    )
    if workflow_id:
        leave_request.workflow_instance_id = workflow_id
        session.add(leave_request)
    if not payload.as_draft:
        await signature_service.capture(
            session=session,
            actor=current_user,
            entity=leave_request,
            entity_type="leave_request",
            signature_version=payload.signature_version,
        )
    await session.commit()
    await session.refresh(leave_request)
    logger.info(
        "Leave request created",
        extra={
            "leave_request_id": str(leave_request.id),
            "user_id": str(current_user.id),
            "as_draft": payload.as_draft,
        },
    )
    return leave_request


async def submit_leave_request(
    *,
    session: AsyncSession,
    current_user: User,
    leave_request_id: uuid.UUID,
    payload: LeaveRequestSubmit,
) -> LeaveRequest:
    """Submit a previously-saved DRAFT leave request into the approval chain."""
    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    leave_request = await get_leave_request_or_404(
        session=session, leave_request_id=leave_request_id
    )
    if leave_request.user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED)
    if leave_request.status not in EDITABLE_STATUSES:
        raise HRValidationError(ERROR_LEAVE_REQUEST_NOT_DRAFT)

    await validate_acting_officer(
        session, leave_request.department_id, leave_request.acting_officer_id
    )
    validate_leave_fields(
        start_date=leave_request.start_date,
        end_date=leave_request.end_date,
        days_requested=leave_request.days_requested,
        leave_type=leave_request.leave_type,
        professional_appointment_subtype=leave_request.professional_appointment_subtype,
        reason=leave_request.reason,
        travel_from_date=leave_request.travel_from_date,
        travel_to_date=leave_request.travel_to_date,
        submitting=True,
    )

    if leave_request.workflow_instance_id:
        await submit_draft_workflow(
            session=session,
            current_user=current_user,
            workflow_instance_id=leave_request.workflow_instance_id,
            co_approver_user_ids=payload.co_approver_user_ids,
            commit=False,
        )
    else:
        # Drafted before a template existed for the department — start fresh.
        workflow_id = await start_workflow_for_entity(
            session=session,
            current_user=current_user,
            department_id=leave_request.department_id,
            workflow_type=WorkflowType.LEAVE_REQUEST,
            entity_type="leave_request",
            entity_id=leave_request.id,
            co_approver_user_ids=payload.co_approver_user_ids,
            submit=True,
        )
        if workflow_id:
            leave_request.workflow_instance_id = workflow_id

    leave_request.status = RequestStatus.SUBMITTED
    leave_request.updated_at = utc_now()
    session.add(leave_request)
    await signature_service.capture(
        session=session,
        actor=current_user,
        entity=leave_request,
        entity_type="leave_request",
        signature_version=payload.signature_version,
    )
    await session.commit()
    await session.refresh(leave_request)
    logger.info(
        "Leave request submitted from draft",
        extra={
            "leave_request_id": str(leave_request.id),
            "user_id": str(current_user.id),
        },
    )
    return leave_request


async def update_leave_request(
    *,
    session: AsyncSession,
    current_user: User,
    leave_request_id: uuid.UUID,
    payload: LeaveRequestCreate,
) -> LeaveRequest:
    """Edit a still-DRAFT leave request in place (no new record is created)."""
    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    leave_request = await get_leave_request_or_404(
        session=session, leave_request_id=leave_request_id
    )
    if leave_request.user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED)
    if leave_request.status not in EDITABLE_STATUSES:
        raise HRValidationError(ERROR_LEAVE_REQUEST_NOT_DRAFT)

    validate_leave_fields(
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_requested=payload.days_requested,
        leave_type=payload.leave_type,
        professional_appointment_subtype=payload.professional_appointment_subtype,
        reason=payload.reason,
        travel_from_date=payload.travel_from_date,
        travel_to_date=payload.travel_to_date,
        submitting=False,
    )

    await validate_acting_officer(
        session, payload.department_id, payload.acting_officer_id
    )
    leave_request.department_id = payload.department_id
    leave_request.leave_type = payload.leave_type
    leave_request.start_date = payload.start_date
    leave_request.end_date = payload.end_date
    leave_request.days_requested = payload.days_requested
    leave_request.days_with_pay = payload.days_with_pay
    leave_request.days_without_pay = payload.days_without_pay
    leave_request.professional_appointment_subtype = (
        payload.professional_appointment_subtype
    )
    leave_request.reason = payload.reason
    leave_request.contact_phone = payload.contact_phone
    leave_request.leave_address = payload.leave_address
    leave_request.travel_from_date = payload.travel_from_date
    leave_request.travel_to_date = payload.travel_to_date
    leave_request.salary_in_advance = payload.salary_in_advance
    leave_request.requires_acting_appointment = payload.requires_acting_appointment
    leave_request.acting_officer_id = payload.acting_officer_id
    leave_request.expected_return_date = payload.expected_return_date
    leave_request.updated_at = utc_now()
    session.add(leave_request)
    await session.commit()
    await session.refresh(leave_request)
    return leave_request


async def delete_leave_request(
    *, session: AsyncSession, current_user: User, leave_request_id: uuid.UUID
) -> None:
    """Delete an own DRAFT leave request (and its unstarted workflow instance)."""
    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    leave_request = await get_leave_request_or_404(
        session=session, leave_request_id=leave_request_id
    )
    if leave_request.user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED)
    if leave_request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_LEAVE_REQUEST_NOT_DRAFT)

    workflow_instance_id = leave_request.workflow_instance_id
    if workflow_instance_id:
        instance = await session.get(WorkflowInstance, workflow_instance_id)
        if instance is not None and instance.status != WorkflowStatus.DRAFT:
            raise HRValidationError(
                "Previously submitted forms and approval history must be retained"
            )
    # Delete the request first (it holds the FK to the instance), then the
    # DRAFT instance itself (a draft has no step rows to clean up).
    await session.delete(leave_request)
    if workflow_instance_id:
        instance = await session.get(WorkflowInstance, workflow_instance_id)
        if instance:
            await session.delete(instance)
    await session.commit()


async def action_leave_request(
    *,
    session: AsyncSession,
    current_user: User,
    leave_request_id: uuid.UUID,
    payload: LeaveRequestAction,
) -> LeaveRequest:
    require_permission(current_user=current_user, permission_key="leave.request.action")
    leave_request = await get_leave_request_or_404(
        session=session,
        leave_request_id=leave_request_id,
    )
    if not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=leave_request.user_id,
        permission_key="leave.request.action",
    ):
        raise HRPermissionDeniedError(ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED)
    if payload.status == RequestStatus.RETURNED:
        raise HRValidationError(
            "Return a form from the approvals inbox, with a reason for its author"
        )
    if leave_request.workflow_instance_id:
        from src.hr.workflow.models import WorkflowAction
        from src.hr.workflow.schemas import WorkflowActionRequest
        from src.hr.workflow.service import apply_workflow_action

        actions = {
            "APPROVED": WorkflowAction.APPROVE,
            "REJECTED": WorkflowAction.REJECT,
            "CANCELLED": WorkflowAction.CANCEL,
        }
        action = actions.get(payload.status.value)
        if action is None:
            raise HRValidationError("Unsupported workflow action")
        await apply_workflow_action(
            session=session,
            current_user=current_user,
            workflow_instance_id=leave_request.workflow_instance_id,
            action_in=WorkflowActionRequest(action=action),
        )
        await session.refresh(leave_request)
        return leave_request
    await ledger.lock_employee(session, leave_request.user_id)
    # Re-read under the lock: a concurrent action may have resolved the request.
    await session.refresh(leave_request, attribute_names=["status"])
    if (
        leave_request.status == RequestStatus.CANCELLED
        and payload.status == RequestStatus.CANCELLED
    ):
        return leave_request
    if leave_request.status in {
        RequestStatus.APPROVED,
        RequestStatus.REJECTED,
        RequestStatus.CANCELLED,
    } and not (
        leave_request.status == RequestStatus.APPROVED
        and payload.status == RequestStatus.CANCELLED
    ):
        raise HRValidationError("Request already resolved")
    leave_request.status = payload.status
    if payload.head_of_dept_comments is not None:
        leave_request.head_of_dept_comments = payload.head_of_dept_comments
    leave_request.updated_at = utc_now()
    session.add(leave_request)
    if (
        payload.status == RequestStatus.APPROVED
        and leave_request.leave_type not in UNTRACKED_LEAVE_TYPES
    ):
        await ledger.post(
            session,
            user_id=leave_request.user_id,
            leave_type=leave_request.leave_type.value,
            kind=LeaveEntryKind.APPROVAL_DEBIT,
            delta=-leave_request.days_requested,
            reason="Leave request approved",
            actor_id=current_user.id,
            leave_request_id=leave_request.id,
        )
    elif payload.status == RequestStatus.CANCELLED:
        await ledger.reverse_approval(
            session, request=leave_request, actor_id=current_user.id
        )
    await session.commit()
    await session.refresh(leave_request)
    logger.info(
        "Leave request actioned",
        extra={
            "leave_request_id": str(leave_request.id),
            "status": leave_request.status.value,
            "actor_id": str(current_user.id),
        },
    )
    return leave_request


async def list_leave_requests(
    *, session: AsyncSession, current_user: User, skip: int = 0, limit: int = 100
) -> tuple[list[LeaveRequest], int]:
    base = select(LeaveRequest).where(LeaveRequest.user_id == current_user.id)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(LeaveRequest.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0


WORKING_DAYS_MAX_RANGE = 366
_FIRST_WEEKEND_DAY = 5


async def working_days_between(
    *,
    session: AsyncSession,
    current_user: User,
    start: date,
    end: date,
    leave_type: LeaveType | None = None,
) -> WorkingDaysPublic:
    """Working days in a range for the caller, excluding public holidays.

    A suggestion for the leave form's "days requested" field, never a policy
    decision: the requester and approver can still change the figure. When the
    caller's published roster covers every day in the range, working days are
    the rostered work shifts; otherwise they are Monday to Friday. Holidays
    come from the (provisional) public holiday table and are reported with a
    flag so the form can say so.
    """
    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    if end < start:
        raise HRValidationError("End date must be on or after start date")
    calendar_days = (end - start).days + 1
    if calendar_days > WORKING_DAYS_MAX_RANGE:
        raise HRValidationError(
            f"Date range must not exceed {WORKING_DAYS_MAX_RANGE} days"
        )

    holiday_rows = (
        await session.scalars(
            select(PublicHoliday)
            .where(
                PublicHoliday.holiday_date >= start,
                PublicHoliday.holiday_date <= end,
                PublicHoliday.country_code == "GD",
            )
            .order_by(PublicHoliday.holiday_date)
        )
    ).all()
    holiday_dates = {row.holiday_date for row in holiday_rows}

    department_id = await session.scalar(
        select(EmploymentRecord.department_id).where(
            EmploymentRecord.user_id == current_user.id
        )
    )
    rostered: dict[date, bool] = {}
    if department_id is not None:
        assignments = await session.execute(
            select(RosterAssignment.assignment_date, ShiftCatalog)
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(
                RosterPeriod.department_id == department_id,
                RosterPeriod.status.in_(
                    [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
                ),
                RosterAssignment.user_id == current_user.id,
                RosterAssignment.assignment_date >= start,
                RosterAssignment.assignment_date <= end,
            )
        )
        for assignment_date, shift in assignments.all():
            rostered[assignment_date] = (
                shift.category == ShiftCategory.WORK and shift.counts_as_work_hours
            )

    days = [start + timedelta(days=offset) for offset in range(calendar_days)]
    use_roster = all(day in rostered for day in days)
    counted = 0
    extra_days = 0
    for day in days:
        would_work = rostered[day] if use_roster else day.weekday() < _FIRST_WEEKEND_DAY
        if day in holiday_dates:
            extra_days += 1 if would_work else 0
            continue
        counted += 1 if would_work else 0
    suggested_extra = extra_days if leave_type == LeaveType.VACATION else 0
    return WorkingDaysPublic(
        start=start,
        end=end,
        calendar_days=calendar_days,
        working_days=counted,
        suggested_extra_days=suggested_extra,
        suggested_extra_days_note=(
            f"Policy (provisional): {suggested_extra} public holiday"
            f"{'' if suggested_extra == 1 else 's'} inside this vacation. "
            f"HR may grant {suggested_extra} extra day"
            f"{'' if suggested_extra == 1 else 's'}; nothing is added "
            "to your balance automatically."
            if suggested_extra
            else None
        ),
        method="roster" if use_roster else "weekdays",
        holidays=[
            WorkingDayHoliday(
                holiday_date=row.holiday_date,
                name=row.name,
                provisional=row.needs_verification or row.source == PROVISIONAL_SOURCE,
            )
            for row in holiday_rows
        ],
    )
