import uuid
from typing import Any, cast

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import col, delete, select

from src.auth.models import Role, RoleAssignmentScope, User, UserRoleAssignment
from src.auth.policy import can_act_on_user
from src.utils.datetime import utc_now

from . import constants as hr_constants
from .exceptions import (
    EmploymentNotFoundError,
    HRPermissionDeniedError,
    HRProfileNotFoundError,
)
from .models import (
    ApprovalAuthority,
    Department,
    EmploymentRecord,
    LeaveBalance,
    LeaveCarryOver,
    RosterPreference,
    RosterPreferredShift,
    RosterRestrictedShift,
    UserAddress,
    UserProfile,
    UserStatus,
)
from .schemas import (
    AddressPublic,
    ApprovalAuthorityPublic,
    ApprovalAuthorityUpdate,
    DepartmentPublic,
    EmploymentPublic,
    EmploymentUpdate,
    LeavePublic,
    ProfileAuditPublic,
    ProfileDetailsPublic,
    ProfileIdentityPublic,
    RolePublic,
    RosterPreferencesPublic,
    UserProfilePublic,
)


def _normalize_shift_codes(codes: list[str]) -> list[str]:
    unique_codes: set[str] = set()
    normalized_codes: list[str] = []
    for code in codes:
        normalized = code.strip().upper()
        if not normalized or normalized in unique_codes:
            continue
        unique_codes.add(normalized)
        normalized_codes.append(normalized)
    return normalized_codes


def _permissions_for_user(user: User) -> list[str]:
    permissions: set[str] = set()
    for role in user.roles:
        for permission in role.permissions:
            permissions.add(permission.key.lower())
    return sorted(permissions)


async def _active_role_assignment_scope_by_role(
    *, session: AsyncSession, user_id: uuid.UUID
) -> dict[uuid.UUID, RoleAssignmentScope]:
    now = utc_now()
    result = await session.execute(
        select(UserRoleAssignment).where(UserRoleAssignment.user_id == user_id)
    )
    assignments = list(result.scalars().all())
    precedence = {
        RoleAssignmentScope.SELF: 1,
        RoleAssignmentScope.DEPARTMENT: 2,
        RoleAssignmentScope.ALL: 3,
    }
    scope_by_role: dict[uuid.UUID, RoleAssignmentScope] = {}
    for assignment in assignments:
        if assignment.effective_from > now:
            continue
        if assignment.effective_to and assignment.effective_to < now:
            continue
        current_scope = scope_by_role.get(assignment.role_id)
        if (
            current_scope is None
            or precedence[assignment.scope] > precedence[current_scope]
        ):
            scope_by_role[assignment.role_id] = assignment.scope
    return scope_by_role


async def _get_or_create_profile(session: AsyncSession, user: User) -> UserProfile:
    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user.id)
    )
    profile = result.scalars().first()
    if profile:
        return profile
    profile = UserProfile(
        user_id=user.id,
        phone=None,
        avatar_url=None,
        status=UserStatus.ACTIVE,
        created_by=str(user.id),
    )
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def _get_or_create_address(
    session: AsyncSession, user_id: uuid.UUID
) -> UserAddress:
    result = await session.execute(
        select(UserAddress).where(UserAddress.user_id == user_id)
    )
    address = result.scalars().first()
    if address:
        return address
    address = UserAddress(user_id=user_id)
    session.add(address)
    await session.commit()
    await session.refresh(address)
    return address


async def _get_or_create_roster_preference(
    session: AsyncSession, user_id: uuid.UUID
) -> RosterPreference:
    result = await session.execute(
        select(RosterPreference).where(RosterPreference.user_id == user_id)
    )
    preference = result.scalars().first()
    if preference:
        return preference
    preference = RosterPreference(user_id=user_id)
    session.add(preference)
    await session.commit()
    await session.refresh(preference)
    return preference


async def _get_or_create_approval_authority(
    session: AsyncSession, user_id: uuid.UUID
) -> ApprovalAuthority:
    result = await session.execute(
        select(ApprovalAuthority).where(ApprovalAuthority.user_id == user_id)
    )
    authority = result.scalars().first()
    if authority:
        return authority
    authority = ApprovalAuthority(user_id=user_id)
    session.add(authority)
    await session.commit()
    await session.refresh(authority)
    return authority


async def _get_employment_record(
    session: AsyncSession, user_id: uuid.UUID
) -> EmploymentRecord | None:
    result = await session.execute(
        select(EmploymentRecord).where(EmploymentRecord.user_id == user_id)
    )
    return result.scalars().first()


async def _build_profile_response(
    session: AsyncSession,
    user: User,
    profile: UserProfile,
    address: UserAddress,
    roster_preference: RosterPreference,
    approval_authority: ApprovalAuthority,
) -> UserProfilePublic:
    employment_record = await _get_employment_record(session=session, user_id=user.id)
    department = (
        await session.get(Department, employment_record.department_id)
        if employment_record and employment_record.department_id
        else None
    )
    pref_result = await session.execute(
        select(RosterPreferredShift).where(RosterPreferredShift.user_id == user.id)
    )
    preferred_shifts = list(pref_result.scalars().all())
    restr_result = await session.execute(
        select(RosterRestrictedShift).where(RosterRestrictedShift.user_id == user.id)
    )
    restricted_shifts = list(restr_result.scalars().all())
    leave_result = await session.execute(
        select(LeaveBalance).where(LeaveBalance.user_id == user.id)
    )
    leave_balances = list(leave_result.scalars().all())
    carry_result = await session.execute(
        select(LeaveCarryOver).where(LeaveCarryOver.user_id == user.id)
    )
    carry_over = list(carry_result.scalars().all())
    scope_by_role = await _active_role_assignment_scope_by_role(
        session=session, user_id=user.id
    )

    roles = [
        RolePublic(
            name=role.name,
            scope=scope_by_role.get(role.id, RoleAssignmentScope.SELF),
        )
        for role in user.roles
    ]

    avatar_url = profile.avatar_url
    if not avatar_url and user.user_image:
        avatar_url = user.user_image.object_key

    employment = EmploymentPublic(
        employee_number=(
            employment_record.employee_number if employment_record else None
        ),
        department=(
            DepartmentPublic(id=department.id, name=department.name)
            if department
            else None
        ),
        position=employment_record.position if employment_record else None,
        employment_type=(
            employment_record.employment_type if employment_record else None
        ),
        start_date=employment_record.start_date if employment_record else None,
        supervisor_id=employment_record.supervisor_id if employment_record else None,
        work_location=employment_record.work_location if employment_record else None,
        status=employment_record.status if employment_record else None,
    )

    return UserProfilePublic(
        id=user.id,
        identity=ProfileIdentityPublic(
            username=user.username,
            email=user.email,
            phone=profile.phone,
            avatar_url=avatar_url,
            status=profile.status,
        ),
        profile=ProfileDetailsPublic(
            first_name=user.first_name,
            middle_name=user.middle_name,
            last_name=user.last_name,
            display_name=user.full_name,
            date_of_birth=profile.date_of_birth,
            nationality=profile.nationality,
            gender=profile.gender,
        ),
        address=AddressPublic(
            line_1=address.line_1,
            line_2=address.line_2,
            city=address.city,
            parish=address.parish,
            postal_code=address.postal_code,
            country=address.country,
        ),
        employment=employment,
        roles=roles,
        permissions=_permissions_for_user(user=user),
        roster_preferences=RosterPreferencesPublic(
            default_shift_pattern=roster_preference.default_shift_pattern,
            preferred_shifts=[row.shift_code for row in preferred_shifts],
            restricted_shifts=[row.shift_code for row in restricted_shifts],
            max_night_shifts_per_month=roster_preference.max_night_shifts_per_month,
        ),
        leave=LeavePublic(
            balances={row.leave_type: row.balance for row in leave_balances},
            carry_over={row.leave_type: row.days for row in carry_over},
        ),
        approval_authority=ApprovalAuthorityPublic(
            can_approve_leave=approval_authority.can_approve_leave,
            can_approve_shift_swap=approval_authority.can_approve_shift_swap,
            can_approve_timesheets=approval_authority.can_approve_timesheets,
            can_approve_absentee_reports=approval_authority.can_approve_absentee_reports,
        ),
        audit=ProfileAuditPublic(
            created_at=profile.created_at,
            created_by=profile.created_by,
            updated_at=profile.updated_at,
        ),
    )


async def read_profile_for_user(
    *, session: AsyncSession, current_user: User
) -> UserProfilePublic:
    profile = await _get_or_create_profile(session=session, user=current_user)
    address = await _get_or_create_address(session=session, user_id=current_user.id)
    roster_preference = await _get_or_create_roster_preference(
        session=session, user_id=current_user.id
    )
    approval_authority = await _get_or_create_approval_authority(
        session=session, user_id=current_user.id
    )
    return await _build_profile_response(
        session=session,
        user=current_user,
        profile=profile,
        address=address,
        roster_preference=roster_preference,
        approval_authority=approval_authority,
    )


async def update_profile_details(
    *,
    session: AsyncSession,
    user: User,
    profile_data: dict[str, object],
) -> UserProfile:
    profile = await _get_or_create_profile(session=session, user=user)
    safe_profile_data = {
        key: value
        for key, value in profile_data.items()
        if key not in {"first_name", "middle_name", "last_name", "display_name"}
    }
    profile.sqlmodel_update(safe_profile_data)
    profile.updated_at = utc_now()
    session.add(profile)
    return profile


async def update_address(
    *,
    session: AsyncSession,
    user_id: uuid.UUID,
    address_data: dict[str, object],
) -> UserAddress:
    address = await _get_or_create_address(session=session, user_id=user_id)
    address.sqlmodel_update(address_data)
    address.updated_at = utc_now()
    session.add(address)
    return address


async def update_roster_preferences(
    *,
    session: AsyncSession,
    user_id: uuid.UUID,
    roster_data: dict[str, object],
) -> RosterPreference:
    roster_preference = await _get_or_create_roster_preference(
        session=session, user_id=user_id
    )
    preferred_shifts = roster_data.pop("preferred_shifts", None)
    restricted_shifts = roster_data.pop("restricted_shifts", None)
    roster_preference.sqlmodel_update(roster_data)
    roster_preference.updated_at = utc_now()
    session.add(roster_preference)

    if isinstance(preferred_shifts, list):
        await session.execute(
            delete(RosterPreferredShift).where(
                col(RosterPreferredShift.user_id) == user_id
            )
        )
        for shift_code in _normalize_shift_codes(preferred_shifts):
            session.add(RosterPreferredShift(user_id=user_id, shift_code=shift_code))

    if isinstance(restricted_shifts, list):
        await session.execute(
            delete(RosterRestrictedShift).where(
                col(RosterRestrictedShift.user_id) == user_id
            )
        )
        for shift_code in _normalize_shift_codes(restricted_shifts):
            session.add(RosterRestrictedShift(user_id=user_id, shift_code=shift_code))

    return roster_preference


async def update_profile_for_current_user(
    *,
    session: AsyncSession,
    current_user: User,
    payload: dict[str, object],
) -> UserProfilePublic:
    profile_updates = payload.get("profile")
    if isinstance(profile_updates, dict):
        await update_profile_details(
            session=session, user=current_user, profile_data=profile_updates
        )

    address_updates = payload.get("address")
    if isinstance(address_updates, dict):
        await update_address(
            session=session,
            user_id=current_user.id,
            address_data=address_updates,
        )

    roster_updates = payload.get("roster_preferences")
    if isinstance(roster_updates, dict):
        await update_roster_preferences(
            session=session,
            user_id=current_user.id,
            roster_data=roster_updates,
        )

    if isinstance(profile_updates, dict):
        # Auth user names are canonical identity fields.
        auth_updates = {
            key: value
            for key, value in profile_updates.items()
            if key in {"first_name", "middle_name", "last_name"}
        }
        if auth_updates:
            current_user.sqlmodel_update(auth_updates)
            session.add(current_user)

    await session.commit()
    await session.refresh(current_user)
    return await read_profile_for_user(session=session, current_user=current_user)


async def _can_manage_employment(
    *, session: AsyncSession, current_user: User, target_user_id: uuid.UUID
) -> bool:
    return await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=target_user_id,
        permission_key="hr.employment.manage",
    )


def _apply_employment_update(
    employment: EmploymentRecord, updates: EmploymentUpdate
) -> EmploymentRecord:
    employment_data = updates.model_dump(exclude_unset=True)
    if employment_data:
        employment.sqlmodel_update(employment_data)
        employment.updated_at = utc_now()
    return employment


def _apply_approval_update(
    authority: ApprovalAuthority, updates: ApprovalAuthorityUpdate
) -> ApprovalAuthority:
    approval_data = updates.model_dump(exclude_unset=True)
    if approval_data:
        authority.sqlmodel_update(approval_data)
        authority.updated_at = utc_now()
    return authority


async def update_employment_for_user(
    *,
    session: AsyncSession,
    current_user: User,
    target_user_id: uuid.UUID,
    employment_update: EmploymentUpdate | None,
    approval_update: ApprovalAuthorityUpdate | None,
) -> UserProfilePublic:
    stmt = (
        select(User)
        .where(User.id == target_user_id)
        .options(
            selectinload(cast(Any, User.roles)).selectinload(
                cast(Any, Role.permissions)
            ),
        )
    )
    result = await session.execute(stmt)
    target_user = result.scalars().unique().first()
    if not target_user:
        raise HRProfileNotFoundError()

    if not await _can_manage_employment(
        session=session, current_user=current_user, target_user_id=target_user_id
    ):
        raise HRPermissionDeniedError(
            hr_constants.ERROR_SUPERVISOR_CAN_ONLY_MANAGE_DEPARTMENT
        )

    employment = await _get_employment_record(session=session, user_id=target_user_id)
    if not employment:
        raise EmploymentNotFoundError()

    if employment_update:
        _apply_employment_update(employment, employment_update)
        session.add(employment)

    if approval_update:
        authority = await _get_or_create_approval_authority(
            session=session, user_id=target_user_id
        )
        _apply_approval_update(authority, approval_update)
        session.add(authority)

    await session.commit()
    await session.refresh(target_user)
    return await read_profile_for_user(session=session, current_user=target_user)
