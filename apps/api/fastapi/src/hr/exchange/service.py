import logging
import uuid

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr.constants import (
    ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED,
    ERROR_SHIFT_SWAP_NOT_DRAFT,
)
from src.hr.dependencies import get_shift_swap_request_or_404
from src.hr.exceptions import (
    HRPermissionDeniedError,
    HRValidationError,
)
from src.hr.models import RequestStatus
from src.hr.signatures import service as signature_service
from src.hr.workflow.models import WorkflowInstance, WorkflowType
from src.hr.workflow.service import start_workflow_for_entity, submit_draft_workflow
from src.utils.datetime import utc_now

from . import roster_effects
from .models import ShiftSwapRequest
from .schemas import ShiftSwapAction, ShiftSwapRequestCreate, ShiftSwapSubmit

logger = logging.getLogger(__name__)


async def validate_request(
    session: AsyncSession, request: ShiftSwapRequest, *, submitting: bool
) -> None:
    await roster_effects.validate_participants(session, request)
    if submitting:
        await roster_effects.exchange_rows(session, request)


def agreement_gate(
    request: ShiftSwapRequest, colleagues: list[uuid.UUID]
) -> list[uuid.UUID]:
    if request.requesting_user_id in colleagues:
        raise HRValidationError(
            "The requesting employee cannot approve their own exchange"
        )
    return list(dict.fromkeys([request.counterpart_user_id, *colleagues]))


async def validate_coapprovers(
    session: AsyncSession, request: ShiftSwapRequest, colleagues: list[uuid.UUID]
) -> list[uuid.UUID]:
    from src.hr.models import EmploymentRecord, EmploymentStatus

    required = agreement_gate(request, colleagues)
    found = set(
        (
            await session.execute(
                select(EmploymentRecord.user_id).where(
                    EmploymentRecord.user_id.in_(required),
                    EmploymentRecord.department_id == request.department_id,
                    EmploymentRecord.status == EmploymentStatus.ACTIVE,
                )
            )
        )
        .scalars()
        .all()
    )
    if found != set(required):
        raise HRValidationError(
            "Co-approvers must be active members of the request department"
        )
    return required


async def preview_shift_swap_pdf(
    *, session: AsyncSession, current_user: User, payload: ShiftSwapRequestCreate
) -> bytes:
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.create.self"
    )
    request = ShiftSwapRequest(
        requesting_user_id=current_user.id,
        **payload.model_dump(
            exclude={"as_draft", "co_approver_user_ids", "signature_version"}
        ),
    )
    await validate_request(session, request, submitting=False)
    values: dict[str, object] = payload.model_dump(
        exclude={"as_draft", "co_approver_user_ids", "signature_version"}
    )
    values["requesting_user_id"] = current_user.id
    snapshot = await signature_service.build_document_snapshot(
        session=session,
        actor=current_user,
        entity_type="shift_swap",
        entity_id="Draft preview",
        department_id=payload.department_id,
        values=values,
        signed_at=None,
    )
    return await run_in_threadpool(signature_service.render_pdf, snapshot, None)


async def list_my_shift_swap_requests(
    *, session: AsyncSession, current_user: User, skip: int = 0, limit: int = 100
) -> tuple[list[ShiftSwapRequest], int]:
    """Shift swaps the current user filed or is the counterpart of."""
    base = select(ShiftSwapRequest).where(
        (ShiftSwapRequest.requesting_user_id == current_user.id)
        | (ShiftSwapRequest.counterpart_user_id == current_user.id)
    )
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(ShiftSwapRequest.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0


async def create_shift_swap_request(
    *, session: AsyncSession, current_user: User, payload: ShiftSwapRequestCreate
) -> ShiftSwapRequest:
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.create.self"
    )
    request = ShiftSwapRequest(
        requesting_user_id=current_user.id,
        counterpart_user_id=payload.counterpart_user_id,
        department_id=payload.department_id,
        swap_type=payload.swap_type,
        source_date=payload.source_date,
        source_shift_code=payload.source_shift_code,
        target_date=payload.target_date,
        target_shift_code=payload.target_shift_code,
        effective_date=payload.effective_date,
        restoration_date=payload.restoration_date,
        reason=payload.reason,
        status=RequestStatus.DRAFT if payload.as_draft else RequestStatus.SUBMITTED,
    )
    await validate_request(session, request, submitting=not payload.as_draft)
    required_approvers = (
        []
        if payload.as_draft
        else await validate_coapprovers(session, request, payload.co_approver_user_ids)
    )
    # Flush to obtain the id, then start the workflow and commit once so the
    # request and its workflow instance are persisted atomically.
    session.add(request)
    await session.flush()
    request.workflow_instance_id = await start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.SHIFT_SWAP,
        entity_type="shift_swap",
        entity_id=request.id,
        co_approver_user_ids=required_approvers,
        submit=not payload.as_draft,
    )
    session.add(request)
    if not payload.as_draft:
        await signature_service.capture(
            session=session,
            actor=current_user,
            entity=request,
            entity_type="shift_swap",
            signature_version=payload.signature_version,
        )
    await session.commit()
    await session.refresh(request)
    return request


async def submit_shift_swap_request(
    *,
    session: AsyncSession,
    current_user: User,
    shift_swap_id: uuid.UUID,
    payload: ShiftSwapSubmit,
) -> ShiftSwapRequest:
    """Submit a previously-saved DRAFT shift swap request into the approval chain."""
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.create.self"
    )
    request = await get_shift_swap_request_or_404(
        session=session, shift_swap_id=shift_swap_id
    )
    if request.requesting_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED)
    if request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_SHIFT_SWAP_NOT_DRAFT)

    await validate_request(session, request, submitting=True)
    required_approvers = await validate_coapprovers(
        session, request, payload.co_approver_user_ids
    )

    if request.workflow_instance_id:
        await submit_draft_workflow(
            session=session,
            current_user=current_user,
            workflow_instance_id=request.workflow_instance_id,
            co_approver_user_ids=required_approvers,
            commit=False,
        )
    else:
        # Drafted before a template existed for the department — start fresh.
        workflow_id = await start_workflow_for_entity(
            session=session,
            current_user=current_user,
            department_id=request.department_id,
            workflow_type=WorkflowType.SHIFT_SWAP,
            entity_type="shift_swap",
            entity_id=request.id,
            co_approver_user_ids=required_approvers,
            submit=True,
        )
        if workflow_id:
            request.workflow_instance_id = workflow_id

    request.status = RequestStatus.SUBMITTED
    request.updated_at = utc_now()
    session.add(request)
    await signature_service.capture(
        session=session,
        actor=current_user,
        entity=request,
        entity_type="shift_swap",
        signature_version=payload.signature_version,
    )
    await session.commit()
    await session.refresh(request)
    logger.info(
        "Shift swap submitted from draft",
        extra={
            "shift_swap_id": str(request.id),
            "user_id": str(current_user.id),
        },
    )
    return request


async def update_shift_swap_request(
    *,
    session: AsyncSession,
    current_user: User,
    shift_swap_id: uuid.UUID,
    payload: ShiftSwapRequestCreate,
) -> ShiftSwapRequest:
    """Edit a still-DRAFT shift swap request in place (no new record is created)."""
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.create.self"
    )
    request = await get_shift_swap_request_or_404(
        session=session, shift_swap_id=shift_swap_id
    )
    if request.requesting_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED)
    if request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_SHIFT_SWAP_NOT_DRAFT)

    if request.department_id != payload.department_id:
        raise HRValidationError("Create a new draft to change departments")
    candidate = ShiftSwapRequest(
        requesting_user_id=current_user.id,
        **payload.model_dump(
            exclude={"as_draft", "co_approver_user_ids", "signature_version"}
        ),
    )
    await validate_request(session, candidate, submitting=False)
    request.counterpart_user_id = payload.counterpart_user_id
    request.swap_type = payload.swap_type
    request.source_date = payload.source_date
    request.source_shift_code = payload.source_shift_code
    request.target_date = payload.target_date
    request.target_shift_code = payload.target_shift_code
    request.effective_date = payload.effective_date
    request.restoration_date = payload.restoration_date
    request.reason = payload.reason
    request.updated_at = utc_now()
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return request


async def delete_shift_swap_request(
    *, session: AsyncSession, current_user: User, shift_swap_id: uuid.UUID
) -> None:
    """Delete an own DRAFT shift swap request (and its unstarted workflow)."""
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.create.self"
    )
    request = await get_shift_swap_request_or_404(
        session=session, shift_swap_id=shift_swap_id
    )
    if request.requesting_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED)
    if request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_SHIFT_SWAP_NOT_DRAFT)

    workflow_instance_id = request.workflow_instance_id
    # Delete the request first (it holds the FK to the instance), then the
    # DRAFT instance itself (a draft has no step rows to clean up).
    await session.delete(request)
    if workflow_instance_id:
        instance = await session.get(WorkflowInstance, workflow_instance_id)
        if instance:
            await session.delete(instance)
    await session.commit()


async def action_shift_swap_request(
    *,
    session: AsyncSession,
    current_user: User,
    shift_swap_id: uuid.UUID,
    payload: ShiftSwapAction,
) -> ShiftSwapRequest:
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.action"
    )
    request = await get_shift_swap_request_or_404(
        session=session,
        shift_swap_id=shift_swap_id,
    )
    if not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=request.requesting_user_id,
        permission_key="shift_swap.request.action",
    ):
        raise HRPermissionDeniedError(ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED)
    if request.workflow_instance_id:
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
            workflow_instance_id=request.workflow_instance_id,
            action_in=WorkflowActionRequest(action=action, comments=payload.comments),
        )
        await session.refresh(request)
        return request
    raise HRValidationError(
        "This legacy exchange has no approval workflow; create a new request"
    )
