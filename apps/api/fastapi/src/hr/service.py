import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, col, delete, select

from src.auth.models import RoleAssignmentScope, User, UserRoleAssignment
from src.auth.policy import can_act_on_user

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

ERROR_HR_PROFILE_NOT_FOUND = "HR profile not found for this user"
ERROR_EMPLOYMENT_NOT_FOUND = "Employment record not found for this user"
ERROR_ONLY_SUPERVISOR_OR_ADMIN = "Only supervisors or admins can update employment"
ERROR_SUPERVISOR_CAN_ONLY_MANAGE_DEPARTMENT = (
    "Supervisors can update only users in their department"
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


def _active_role_assignment_scope_by_role(
    *, session: Session, user_id: uuid.UUID
) -> dict[uuid.UUID, RoleAssignmentScope]:
    now = datetime.utcnow()
    assignments = list(
        session.exec(
            select(UserRoleAssignment).where(UserRoleAssignment.user_id == user_id)
        ).all()
    )
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
        if current_scope is None or precedence[assignment.scope] > precedence[current_scope]:
            scope_by_role[assignment.role_id] = assignment.scope
    return scope_by_role


def _get_or_create_profile(session: Session, user: User) -> UserProfile:
    profile = session.exec(
        select(UserProfile).where(UserProfile.user_id == user.id)
    ).first()
    if profile:
        return profile
    profile = UserProfile(
        user_id=user.id,
        first_name=user.first_name,
        middle_name=user.middle_name,
        last_name=user.last_name,
        display_name=user.full_name,
        created_by=str(user.id),
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def _get_or_create_address(session: Session, user_id: uuid.UUID) -> UserAddress:
    address = session.exec(
        select(UserAddress).where(UserAddress.user_id == user_id)
    ).first()
    if address:
        return address
    address = UserAddress(user_id=user_id)
    session.add(address)
    session.commit()
    session.refresh(address)
    return address


def _get_or_create_roster_preference(
    session: Session, user_id: uuid.UUID
) -> RosterPreference:
    preference = session.exec(
        select(RosterPreference).where(RosterPreference.user_id == user_id)
    ).first()
    if preference:
        return preference
    preference = RosterPreference(user_id=user_id)
    session.add(preference)
    session.commit()
    session.refresh(preference)
    return preference


def _get_or_create_approval_authority(
    session: Session, user_id: uuid.UUID
) -> ApprovalAuthority:
    authority = session.exec(
        select(ApprovalAuthority).where(ApprovalAuthority.user_id == user_id)
    ).first()
    if authority:
        return authority
    authority = ApprovalAuthority(user_id=user_id)
    session.add(authority)
    session.commit()
    session.refresh(authority)
    return authority


def _get_employment_record(
    session: Session, user_id: uuid.UUID
) -> EmploymentRecord | None:
    return session.exec(
        select(EmploymentRecord).where(EmploymentRecord.user_id == user_id)
    ).first()


def _build_profile_response(
    session: Session,
    user: User,
    profile: UserProfile,
    address: UserAddress,
    roster_preference: RosterPreference,
    approval_authority: ApprovalAuthority,
) -> UserProfilePublic:
    employment_record = _get_employment_record(session=session, user_id=user.id)
    department = (
        session.get(Department, employment_record.department_id)
        if employment_record and employment_record.department_id
        else None
    )
    preferred_shifts = session.exec(
        select(RosterPreferredShift).where(RosterPreferredShift.user_id == user.id)
    ).all()
    restricted_shifts = session.exec(
        select(RosterRestrictedShift).where(RosterRestrictedShift.user_id == user.id)
    ).all()
    leave_balances = session.exec(
        select(LeaveBalance).where(LeaveBalance.user_id == user.id)
    ).all()
    carry_over = session.exec(
        select(LeaveCarryOver).where(LeaveCarryOver.user_id == user.id)
    ).all()
    scope_by_role = _active_role_assignment_scope_by_role(
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
            display_name=profile.display_name,
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


def read_profile_for_user(*, session: Session, current_user: User) -> UserProfilePublic:
    profile = _get_or_create_profile(session=session, user=current_user)
    address = _get_or_create_address(session=session, user_id=current_user.id)
    roster_preference = _get_or_create_roster_preference(
        session=session, user_id=current_user.id
    )
    approval_authority = _get_or_create_approval_authority(
        session=session, user_id=current_user.id
    )
    return _build_profile_response(
        session=session,
        user=current_user,
        profile=profile,
        address=address,
        roster_preference=roster_preference,
        approval_authority=approval_authority,
    )


def update_profile_details(
    *,
    session: Session,
    user: User,
    profile_data: dict[str, object],
) -> UserProfile:
    profile = _get_or_create_profile(session=session, user=user)
    safe_profile_data = {
        key: value
        for key, value in profile_data.items()
        if key not in {"first_name", "middle_name", "last_name"}
    }
    profile.sqlmodel_update(safe_profile_data)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    return profile


def update_address(
    *,
    session: Session,
    user_id: uuid.UUID,
    address_data: dict[str, object],
) -> UserAddress:
    address = _get_or_create_address(session=session, user_id=user_id)
    address.sqlmodel_update(address_data)
    address.updated_at = datetime.utcnow()
    session.add(address)
    return address


def update_roster_preferences(
    *,
    session: Session,
    user_id: uuid.UUID,
    roster_data: dict[str, object],
) -> RosterPreference:
    roster_preference = _get_or_create_roster_preference(session=session, user_id=user_id)
    preferred_shifts = roster_data.pop("preferred_shifts", None)
    restricted_shifts = roster_data.pop("restricted_shifts", None)
    roster_preference.sqlmodel_update(roster_data)
    roster_preference.updated_at = datetime.utcnow()
    session.add(roster_preference)

    if isinstance(preferred_shifts, list):
        session.exec(
            delete(RosterPreferredShift).where(
                col(RosterPreferredShift.user_id) == user_id
            )
        )
        for shift_code in _normalize_shift_codes(preferred_shifts):
            session.add(RosterPreferredShift(user_id=user_id, shift_code=shift_code))

    if isinstance(restricted_shifts, list):
        session.exec(
            delete(RosterRestrictedShift).where(
                col(RosterRestrictedShift.user_id) == user_id
            )
        )
        for shift_code in _normalize_shift_codes(restricted_shifts):
            session.add(RosterRestrictedShift(user_id=user_id, shift_code=shift_code))

    return roster_preference


def update_profile_for_current_user(
    *,
    session: Session,
    current_user: User,
    payload: dict[str, object],
) -> UserProfilePublic:
    profile_updates = payload.get("profile")
    if isinstance(profile_updates, dict):
        update_profile_details(session=session, user=current_user, profile_data=profile_updates)

    address_updates = payload.get("address")
    if isinstance(address_updates, dict):
        update_address(
            session=session,
            user_id=current_user.id,
            address_data=address_updates,
        )

    roster_updates = payload.get("roster_preferences")
    if isinstance(roster_updates, dict):
        update_roster_preferences(
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
            profile = _get_or_create_profile(session=session, user=current_user)
            profile.first_name = current_user.first_name
            profile.middle_name = current_user.middle_name
            profile.last_name = current_user.last_name
            profile.updated_at = datetime.utcnow()
            session.add(profile)

    session.commit()
    session.refresh(current_user)
    return read_profile_for_user(session=session, current_user=current_user)


def _can_manage_employment(
    *, session: Session, current_user: User, target_user_id: uuid.UUID
) -> bool:
    return can_act_on_user(
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
        employment.updated_at = datetime.utcnow()
    return employment


def _apply_approval_update(
    authority: ApprovalAuthority, updates: ApprovalAuthorityUpdate
) -> ApprovalAuthority:
    approval_data = updates.model_dump(exclude_unset=True)
    if approval_data:
        authority.sqlmodel_update(approval_data)
        authority.updated_at = datetime.utcnow()
    return authority


def update_employment_for_user(
    *,
    session: Session,
    current_user: User,
    target_user_id: uuid.UUID,
    employment_update: EmploymentUpdate | None,
    approval_update: ApprovalAuthorityUpdate | None,
) -> UserProfilePublic:
    target_user = session.get(User, target_user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail=ERROR_HR_PROFILE_NOT_FOUND)

    if not _can_manage_employment(
        session=session, current_user=current_user, target_user_id=target_user_id
    ):
        raise HTTPException(status_code=403, detail=ERROR_SUPERVISOR_CAN_ONLY_MANAGE_DEPARTMENT)

    employment = _get_employment_record(session=session, user_id=target_user_id)
    if not employment:
        raise HTTPException(status_code=404, detail=ERROR_EMPLOYMENT_NOT_FOUND)

    if employment_update:
        _apply_employment_update(employment, employment_update)
        session.add(employment)

    if approval_update:
        authority = _get_or_create_approval_authority(
            session=session, user_id=target_user_id
        )
        _apply_approval_update(authority, approval_update)
        session.add(authority)

    session.commit()
    session.refresh(target_user)
    return read_profile_for_user(session=session, current_user=target_user)
