import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep

from .. import service
from ..schemas import (
    DepartmentCreate,
    DepartmentMemberPublic,
    DepartmentMembersPublic,
    DepartmentPublic,
    DepartmentsPublic,
    DepartmentUpdate,
    EmploymentAdminUpdate,
    EmploymentCreate,
    EmploymentRecordPublic,
    UserProfilePublic,
    UserProfileUpdateMe,
)

router = APIRouter(prefix="/hr", tags=["hr"])


@router.get(
    "/departments",
    response_model=DepartmentsPublic,
    summary="List departments",
    description="Return all departments, ordered by name. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Departments returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def list_departments_endpoint(
    session: SessionDep, current_user: CurrentUser
) -> Any:
    departments = await service.list_departments(
        session=session, current_user=current_user
    )
    return DepartmentsPublic(
        data=[
            DepartmentPublic.model_validate(department, from_attributes=True)
            for department in departments
        ],
        count=len(departments),
    )


@router.post(
    "/departments",
    response_model=DepartmentPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create department",
    description="Create a department. Requires user.manage permission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Department created"},
        status.HTTP_400_BAD_REQUEST: {"description": "Department already exists"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_department_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: DepartmentCreate
) -> Any:
    return await service.create_department(
        session=session, current_user=current_user, payload=payload
    )


@router.patch(
    "/departments/{department_id}",
    response_model=DepartmentPublic,
    summary="Rename department",
    description="Update a department's name. Requires user.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Department updated"},
        status.HTTP_400_BAD_REQUEST: {"description": "Department name already taken"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Department not found"},
    },
)
async def update_department_endpoint(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    department_id: str,
    payload: DepartmentUpdate,
) -> Any:
    return await service.update_department(
        session=session,
        current_user=current_user,
        department_id=department_id,
        payload=payload,
    )


@router.post(
    "/employment/{user_id}",
    response_model=EmploymentRecordPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create employment record",
    description="Create a user's employment record (department, employee number, position). Supervisor or admin only.",
    responses={
        status.HTTP_201_CREATED: {"description": "Employment record created"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Employment record already exists"
        },
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "User or department not found"},
    },
)
async def create_hr_employment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    payload: EmploymentCreate,
) -> Any:
    return await service.create_employment_for_user(
        session=session,
        current_user=current_user,
        target_user_id=user_id,
        payload=payload,
    )


@router.get(
    "/employment/{user_id}",
    response_model=EmploymentRecordPublic,
    summary="Get employment record (admin)",
    description="Return a user's employment record (department, status, position) so an admin can review or edit it. Supervisor or admin only.",
    responses={
        status.HTTP_200_OK: {"description": "Employment record returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {
            "description": "User has no employment record, or user not found"
        },
    },
)
async def read_hr_employment(
    session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> Any:
    return await service.get_employment_for_user(
        session=session,
        current_user=current_user,
        target_user_id=user_id,
    )


@router.get(
    "/departments/{department_id}/members",
    response_model=DepartmentMembersPublic,
    summary="List department members",
    description="Return active members of a department with their employment details, for roster rows. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Department members returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Department not found"},
    },
)
async def list_department_members_endpoint(
    session: SessionDep, current_user: CurrentUser, department_id: str
) -> Any:
    members = await service.list_department_members(
        session=session, current_user=current_user, department_id=department_id
    )
    return DepartmentMembersPublic(
        data=[
            DepartmentMemberPublic(
                user_id=user.id,
                first_name=user.first_name,
                last_name=user.last_name,
                employee_number=employment.employee_number,
                position=employment.position,
                employment_status=employment.status,
            )
            for employment, user in members
        ],
        count=len(members),
    )


@router.get(
    "/profile/me",
    response_model=UserProfilePublic,
    summary="Get my HR profile",
    description="Return the current user's HR profile (identity, employment, address, preferences).",
    responses={
        status.HTTP_200_OK: {"description": "HR profile returned"},
        status.HTTP_404_NOT_FOUND: {
            "description": "HR profile not found for this user"
        },
    },
)
async def read_hr_profile_me(session: SessionDep, current_user: CurrentUser) -> Any:
    return await service.read_profile_for_user(
        session=session, current_user=current_user
    )


@router.patch(
    "/profile/me",
    response_model=UserProfilePublic,
    summary="Update my HR profile",
    description="Update the current user's HR profile (identity, address, preferences).",
    responses={
        status.HTTP_200_OK: {"description": "Profile updated"},
        status.HTTP_404_NOT_FOUND: {
            "description": "HR profile not found for this user"
        },
    },
)
async def update_hr_profile_me(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: UserProfileUpdateMe,
) -> Any:
    update_payload = payload.model_dump(exclude_unset=True)
    return await service.update_profile_for_current_user(
        session=session,
        current_user=current_user,
        payload=update_payload,
    )


@router.patch(
    "/employment/{user_id}",
    response_model=UserProfilePublic,
    summary="Update employment (admin)",
    description="Update a user's employment record and approval authority. Supervisor or admin only.",
    responses={
        status.HTTP_200_OK: {"description": "Employment updated"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {
            "description": "User or employment record not found"
        },
    },
)
async def update_hr_employment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    payload: EmploymentAdminUpdate,
) -> Any:
    return await service.update_employment_for_user(
        session=session,
        current_user=current_user,
        target_user_id=user_id,
        employment_update=payload.employment,
        approval_update=payload.approval_authority,
    )
