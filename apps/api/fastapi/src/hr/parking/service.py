import logging
import uuid

from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr import organisations
from src.hr.constants import ERROR_PARKING_FILE_FOR_USER_NOT_ALLOWED
from src.hr.exceptions import (
    HRPermissionDeniedError,
    HRValidationError,
    ParkingPermitNotFoundError,
)
from src.hr.models import EmploymentRecord, RequestStatus
from src.hr.signatures import service as signature_service
from src.hr.workflow.models import WorkflowInstance, WorkflowStatus, WorkflowType
from src.hr.workflow.service import start_workflow_for_entity, submit_draft_workflow
from src.utils.datetime import utc_now

from .models import ParkingAction, ParkingPermit
from .schemas import ParkingPermitCreate, ParkingPermitIssue, ParkingPermitSubmit

logger = logging.getLogger(__name__)


async def validate_subject(
    session: AsyncSession, actor: User, payload: ParkingPermitCreate
) -> None:
    require_permission(current_user=actor, permission_key="parking.permit.create")
    if payload.user_id != actor.id and not await can_act_on_user(
        session=session,
        current_user=actor,
        target_user_id=payload.user_id,
        permission_key="parking.permit.create",
    ):
        raise HRPermissionDeniedError(ERROR_PARKING_FILE_FOR_USER_NOT_ALLOWED)
    employment = await session.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == payload.user_id)
    )
    if not employment or employment.department_id != payload.department_id:
        raise HRPermissionDeniedError("The employee does not belong to this department")


async def preview_pdf(
    *, session: AsyncSession, current_user: User, payload: ParkingPermitCreate
) -> bytes:
    await validate_subject(session, current_user, payload)
    snapshot = await signature_service.build_document_snapshot(
        session=session,
        actor=current_user,
        entity_type="parking_permit",
        entity_id="draft",
        department_id=payload.department_id,
        values=payload.model_dump(
            exclude={"signature_version", "co_approver_user_ids", "as_draft"}
        ),
        signed_at=None,
    )
    from .pdf import render_parking_pdf

    return await run_in_threadpool(render_parking_pdf, snapshot, None)


async def create_parking_permit(
    *, session: AsyncSession, current_user: User, payload: ParkingPermitCreate
) -> ParkingPermit:
    await validate_subject(session, current_user, payload)
    permit = ParkingPermit(
        user_id=payload.user_id,
        department_id=payload.department_id,
        submitted_by_user_id=current_user.id,
        company_name=payload.company_name,
        phone=payload.phone,
        vehicle_registration_no=payload.vehicle_registration_no,
        vehicle_insurance_issue_date=payload.vehicle_insurance_issue_date,
        vehicle_insurance_expiry_date=payload.vehicle_insurance_expiry_date,
        action_requested=payload.action_requested,
        action_other_detail=payload.action_other_detail,
        fee_amount=payload.fee_amount,
        status=RequestStatus.DRAFT if payload.as_draft else RequestStatus.SUBMITTED,
    )
    # Flush to obtain the id, then start the workflow and commit once so the
    # permit and its workflow instance are persisted atomically.
    session.add(permit)
    await session.flush()
    permit.workflow_instance_id = await start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.PARKING_PERMIT,
        entity_type="parking_permit",
        entity_id=permit.id,
        submit=not payload.as_draft,
        co_approver_user_ids=payload.co_approver_user_ids,
    )
    session.add(permit)
    if not payload.as_draft:
        await signature_service.capture(
            session=session,
            actor=current_user,
            entity=permit,
            entity_type="parking_permit",
            signature_version=payload.signature_version,
        )
    await session.commit()
    await session.refresh(permit)
    logger.info(
        "Parking permit created",
        extra={"permit_id": str(permit.id), "user_id": str(current_user.id)},
    )
    return permit


async def editable_permit(
    session: AsyncSession, actor: User, permit_id: uuid.UUID
) -> ParkingPermit:
    permit = await session.scalar(
        select(ParkingPermit)
        .where(ParkingPermit.id == permit_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not permit:
        raise ParkingPermitNotFoundError()
    if permit.submitted_by_user_id != actor.id:
        raise HRPermissionDeniedError("Only the reporter can edit this application")
    if permit.status != RequestStatus.DRAFT:
        raise HRValidationError("Only a draft application can be edited or submitted")
    return permit


async def update_permit(
    *,
    session: AsyncSession,
    current_user: User,
    permit_id: uuid.UUID,
    payload: ParkingPermitCreate,
) -> ParkingPermit:
    permit = await editable_permit(session, current_user, permit_id)
    await validate_subject(session, current_user, payload)
    if payload.department_id != permit.department_id:
        raise HRValidationError("A draft cannot change its workflow department")
    for key, value in payload.model_dump(
        exclude={"signature_version", "as_draft", "co_approver_user_ids"}
    ).items():
        setattr(permit, key, value)
    permit.updated_at = utc_now()
    await session.commit()
    await session.refresh(permit)
    return permit


async def submit_permit(
    *,
    session: AsyncSession,
    current_user: User,
    permit_id: uuid.UUID,
    payload: ParkingPermitSubmit,
) -> ParkingPermit:
    permit = await editable_permit(session, current_user, permit_id)
    try:
        fields = ParkingPermitCreate.model_validate(permit, from_attributes=True)
    except ValidationError:
        raise HRValidationError(
            "Complete the application fields and check insurance dates before submitting"
        ) from None
    await validate_subject(session, current_user, fields)
    if permit.action_requested == ParkingAction.OTHER and not (
        permit.action_other_detail and permit.action_other_detail.strip()
    ):
        raise HRValidationError("Explain the other action requested")
    if permit.workflow_instance_id:
        await submit_draft_workflow(
            session=session,
            current_user=current_user,
            workflow_instance_id=permit.workflow_instance_id,
            co_approver_user_ids=payload.co_approver_user_ids,
            commit=False,
        )
    else:
        permit.workflow_instance_id = await start_workflow_for_entity(
            session=session,
            current_user=current_user,
            department_id=permit.department_id,
            workflow_type=WorkflowType.PARKING_PERMIT,
            entity_type="parking_permit",
            entity_id=permit.id,
            co_approver_user_ids=payload.co_approver_user_ids,
        )
    permit.status = RequestStatus.SUBMITTED
    permit.updated_at = utc_now()
    await signature_service.capture(
        session=session,
        actor=current_user,
        entity=permit,
        entity_type="parking_permit",
        signature_version=payload.signature_version,
    )
    await session.commit()
    await session.refresh(permit)
    return permit


async def list_parking_permits(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[ParkingPermit], int]:
    statement = select(ParkingPermit)
    if department_id:
        require_permission(
            current_user=current_user,
            permission_key="parking.permit.read.department",
        )
        department = await organisations.department_for(session, department_id)
        await organisations.require_organisation_permission(
            session,
            current_user,
            department.organisation_id,
            "parking.permit.read.department",
            department_id,
        )
        statement = statement.where(ParkingPermit.department_id == department_id)
    else:
        statement = statement.where(
            or_(
                ParkingPermit.user_id == current_user.id,
                ParkingPermit.submitted_by_user_id == current_user.id,
            )
        )
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    result = await session.execute(
        statement.order_by(ParkingPermit.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0


async def issue_decal(
    *,
    session: AsyncSession,
    current_user: User,
    permit_id: uuid.UUID,
    payload: ParkingPermitIssue,
) -> ParkingPermit:
    require_permission(current_user=current_user, permission_key="parking.permit.issue")
    permit = await session.scalar(
        select(ParkingPermit)
        .where(ParkingPermit.id == permit_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not permit:
        raise ParkingPermitNotFoundError()
    department = await organisations.department_for(session, permit.department_id)
    await organisations.require_organisation_permission(
        session,
        current_user,
        department.organisation_id,
        "parking.permit.issue",
        permit.department_id,
    )
    workflow = (
        await session.get(WorkflowInstance, permit.workflow_instance_id)
        if permit.workflow_instance_id
        else None
    )
    if permit.status != RequestStatus.APPROVED or (
        workflow and workflow.status != WorkflowStatus.APPROVED
    ):
        raise HRValidationError(
            "The application must be approved before decal issuance"
        )
    if permit.issued_at:
        if (
            permit.decal_number,
            permit.valid_from,
            permit.valid_to,
            permit.received_by,
        ) == (
            payload.decal_number,
            payload.valid_from,
            payload.valid_to,
            payload.received_by,
        ):
            return permit
        raise HRValidationError(
            "This decal has already been issued; file a renewal or replacement application"
        )
    permit.decal_number = payload.decal_number
    permit.valid_from = payload.valid_from
    permit.valid_to = payload.valid_to
    permit.received_by = payload.received_by
    permit.issued_by_user_id = current_user.id
    permit.issued_at = utc_now()
    permit.updated_at = utc_now()
    session.add(permit)
    await session.commit()
    await session.refresh(permit)
    logger.info(
        "Parking decal issued",
        extra={"permit_id": str(permit.id), "issuer_id": str(current_user.id)},
    )
    return permit
