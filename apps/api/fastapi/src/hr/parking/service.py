import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func, select

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr.constants import ERROR_PARKING_FILE_FOR_USER_NOT_ALLOWED
from src.hr.exceptions import HRPermissionDeniedError, ParkingPermitNotFoundError
from src.hr.workflow.models import WorkflowType
from src.hr.workflow.service import start_workflow_for_entity
from src.utils.datetime import utc_now

from .models import ParkingPermit
from .schemas import ParkingPermitCreate, ParkingPermitIssue

logger = logging.getLogger(__name__)


async def create_parking_permit(
    *, session: AsyncSession, current_user: User, payload: ParkingPermitCreate
) -> ParkingPermit:
    require_permission(
        current_user=current_user, permission_key="parking.permit.create"
    )
    # Filing for another user requires dept-scoped authority over that user, not
    # just the flat create permission (mirrors the timesheet proxy pattern).
    if payload.user_id != current_user.id and not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=payload.user_id,
        permission_key="parking.permit.create",
    ):
        raise HRPermissionDeniedError(ERROR_PARKING_FILE_FOR_USER_NOT_ALLOWED)
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
    )
    session.add(permit)
    await session.commit()
    await session.refresh(permit)
    logger.info(
        "Parking permit created",
        extra={"permit_id": str(permit.id), "user_id": str(current_user.id)},
    )
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
        statement = statement.where(col(ParkingPermit.department_id) == department_id)
    else:
        statement = statement.where(col(ParkingPermit.user_id) == current_user.id)
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    result = await session.execute(
        statement.order_by(col(ParkingPermit.created_at).desc())
        .offset(skip)
        .limit(limit)
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
    permit = await session.get(ParkingPermit, permit_id)
    if not permit:
        raise ParkingPermitNotFoundError()
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
