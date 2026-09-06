import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from src.auth.models import User
from src.baseline import service
from src.baseline.models import ApprovalPolicy
from src.baseline.schemas import (
    BalanceInput,
    GradeInput,
    GradeSetup,
    PolicyInput,
    PolicyPublic,
    RoleConfiguration,
    RolePermissionsInput,
    StaffCard,
    StaffInput,
    StaffSetup,
)
from src.dependencies import CurrentUser, SessionDep, get_current_active_superuser
from src.hr.models import Grade
from src.models import Message

router = APIRouter(
    prefix="/hr",
    tags=["staff-setup"],
    responses={
        403: {"description": "Administrator access required"},
        404: {"description": "Record not found"},
        409: {"description": "Setup conflict"},
    },
)
AdminUser = Annotated[User, Depends(get_current_active_superuser)]


@router.get(
    "/staff-card/me",
    response_model=StaffCard,
    summary="View your GAA staff credential",
    status_code=200,
    description="View your GAA staff credential.",
)
async def read_staff_card(
    *, session: SessionDep, current_user: CurrentUser
) -> StaffCard:
    return await service.card_for(session, current_user)


@router.get(
    "/setup/staff",
    response_model=list[StaffSetup],
    summary="Review staff onboarding",
    status_code=200,
    description="Review staff onboarding.",
)
async def read_staff_setup(
    *, session: SessionDep, current_user: AdminUser
) -> list[StaffSetup]:
    service.require_admin(current_user)
    return await service.list_staff(session)


@router.put(
    "/setup/staff/{user_id}",
    response_model=Message,
    summary="Complete or update staff onboarding",
    status_code=200,
    description="Complete or update staff onboarding.",
)
async def update_staff_setup(
    *,
    session: SessionDep,
    current_user: AdminUser,
    user_id: uuid.UUID,
    body: StaffInput,
) -> Message:
    await service.save_staff(session, current_user, user_id, body)
    return Message(message="Staff setup saved")


@router.post(
    "/setup/staff/{user_id}/offboard",
    response_model=Message,
    summary="Invalidate staff credential and revoke access",
    status_code=200,
    description="Invalidate staff credential and revoke access.",
)
async def offboard_staff(
    *, session: SessionDep, current_user: AdminUser, user_id: uuid.UUID
) -> Message:
    await service.offboard(session, current_user, user_id)
    return Message(
        message="Staff access revoked. Verify linked SURFACE and wis2box accounts are disabled."
    )


@router.post(
    "/setup/staff/{user_id}/balance",
    response_model=Message,
    summary="Record an audited leave balance adjustment",
    status_code=200,
    description="Record an audited leave balance adjustment.",
)
async def update_staff_balance(
    *,
    session: SessionDep,
    current_user: AdminUser,
    user_id: uuid.UUID,
    body: BalanceInput,
) -> Message:
    await service.set_balance(session, current_user, user_id, body)
    return Message(message="Balance adjustment recorded")


@router.get(
    "/setup/grades",
    response_model=list[GradeSetup],
    summary="List editable grade definitions",
    status_code=200,
    description="List editable grade definitions.",
)
async def read_setup_grades(
    *, session: SessionDep, current_user: AdminUser
) -> list[Grade]:
    return await service.read_setup_grades(session=session, current_user=current_user)


@router.put(
    "/setup/grades/{grade_id}",
    response_model=GradeSetup,
    summary="Create or update a grade",
    status_code=200,
    description="Create or update a grade.",
)
async def update_setup_grade(
    *, session: SessionDep, current_user: AdminUser, grade_id: str, body: GradeInput
) -> Grade:
    return await service.save_grade(session, current_user, grade_id, body)


@router.get(
    "/setup/policies",
    response_model=list[PolicyPublic],
    summary="List approval policies",
    status_code=200,
    description="List approval policies.",
)
async def read_setup_policies(
    *, session: SessionDep, current_user: AdminUser
) -> list[ApprovalPolicy]:
    return await service.read_setup_policies(session=session, current_user=current_user)


@router.put(
    "/setup/policies/{key}",
    response_model=PolicyPublic,
    summary="Configure approval policy for future submissions",
    status_code=200,
    description="Configure approval policy for future submissions.",
)
async def update_setup_policy(
    *, session: SessionDep, current_user: AdminUser, key: str, body: PolicyInput
) -> ApprovalPolicy:
    return await service.update_setup_policy(
        session=session, current_user=current_user, key=key, body=body
    )


@router.get(
    "/setup/roles",
    response_model=list[RoleConfiguration],
    summary="Review modular role permissions",
    status_code=200,
    description="Review modular role permissions.",
)
async def read_role_configuration(
    *, session: SessionDep, current_user: AdminUser
) -> list[RoleConfiguration]:
    return await service.read_role_configuration(
        session=session, current_user=current_user
    )


@router.put(
    "/setup/roles/{role_id}",
    response_model=RoleConfiguration,
    summary="Edit a role permission bundle",
    status_code=200,
    description="Edit a role permission bundle.",
)
async def update_role_configuration(
    *,
    session: SessionDep,
    current_user: AdminUser,
    role_id: uuid.UUID,
    body: RolePermissionsInput,
) -> RoleConfiguration:
    return await service.update_role_configuration(
        session=session, current_user=current_user, role_id=role_id, body=body
    )
