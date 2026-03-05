import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from src.auth.models import RoleAssignmentScope, User, UserRoleAssignment

ERROR_PERMISSION_DENIED = "Insufficient permission for this operation"


def _now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _active_assignments(
    *, session: Session, user_id: uuid.UUID
) -> list[UserRoleAssignment]:
    now = _now_utc_naive()
    assignments = list(
        session.exec(
            select(UserRoleAssignment).where(UserRoleAssignment.user_id == user_id)
        ).all()
    )
    return [
        assignment
        for assignment in assignments
        if assignment.effective_from <= now
        and (assignment.effective_to is None or assignment.effective_to >= now)
    ]


def has_permission(*, current_user: User, permission_key: str) -> bool:
    if current_user.is_superuser:
        return True
    normalized_permission_key = permission_key.strip().lower()
    for role in current_user.roles:
        for permission in role.permissions:
            if permission.key.lower() == normalized_permission_key:
                return True
    return False


def require_permission(*, current_user: User, permission_key: str) -> None:
    if not has_permission(current_user=current_user, permission_key=permission_key):
        raise HTTPException(status_code=403, detail=ERROR_PERMISSION_DENIED)


def can_act_on_user(
    *,
    session: Session,
    current_user: User,
    target_user_id: uuid.UUID,
    permission_key: str,
    allow_self: bool = False,
) -> bool:
    if current_user.is_superuser:
        return True

    if not has_permission(current_user=current_user, permission_key=permission_key):
        return False

    if allow_self and current_user.id == target_user_id:
        return True

    role_ids_with_permission = {
        role.id
        for role in current_user.roles
        if any(
            permission.key.lower() == permission_key.lower()
            for permission in role.permissions
        )
    }
    if not role_ids_with_permission:
        return False

    assignments = [
        assignment
        for assignment in _active_assignments(session=session, user_id=current_user.id)
        if assignment.role_id in role_ids_with_permission
    ]
    return _assignment_allows_target(
        session=session,
        assignments=assignments,
        current_user_id=current_user.id,
        target_user_id=target_user_id,
    )


def can_act_on_user_for_role(
    *,
    session: Session,
    current_user: User,
    target_user_id: uuid.UUID,
    required_role_id: uuid.UUID,
    allow_self: bool = False,
) -> bool:
    if current_user.is_superuser:
        return True
    if allow_self and current_user.id == target_user_id:
        return True
    assignments = [
        assignment
        for assignment in _active_assignments(session=session, user_id=current_user.id)
        if assignment.role_id == required_role_id
    ]
    return _assignment_allows_target(
        session=session,
        assignments=assignments,
        current_user_id=current_user.id,
        target_user_id=target_user_id,
    )


def _assignment_allows_target(
    *,
    session: Session,
    assignments: list[UserRoleAssignment],
    current_user_id: uuid.UUID,
    target_user_id: uuid.UUID,
) -> bool:
    if not assignments:
        return False

    # Local import to avoid hard coupling auth package import graph.
    from src.hr.models import EmploymentRecord

    target_employment = session.exec(
        select(EmploymentRecord).where(EmploymentRecord.user_id == target_user_id)
    ).first()
    current_employment = session.exec(
        select(EmploymentRecord).where(EmploymentRecord.user_id == current_user_id)
    ).first()

    for assignment in assignments:
        if assignment.scope == RoleAssignmentScope.ALL:
            return True
        if assignment.scope == RoleAssignmentScope.SELF and current_user_id == target_user_id:
            return True
        if (
            assignment.scope == RoleAssignmentScope.DEPARTMENT
            and target_employment
            and current_employment
            and target_employment.department_id == current_employment.department_id
        ):
            if (
                assignment.department_id
                and assignment.department_id != target_employment.department_id
            ):
                continue
            return True
    return False
