import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.auth.models import Role, RoleAssignmentScope, User, UserRoleAssignment
from src.hr.models import EmploymentRecord

ERROR_PERMISSION_DENIED = "Insufficient permission for this operation"


def _active_assignments(
    *, session: Session, user_id: uuid.UUID, role_name: str | None = None
) -> list[UserRoleAssignment]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    statement = select(UserRoleAssignment).where(UserRoleAssignment.user_id == user_id)
    assignments = list(session.exec(statement).all())
    if role_name:
        role_name_upper = role_name.upper()
        allowed_role_ids = {
            role.id
            for role in session.exec(select(Role).where(col(Role.name) == role_name_upper)).all()
        }
        assignments = [
            assignment
            for assignment in assignments
            if assignment.role_id in allowed_role_ids
        ]
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
    required_role_name: str,
) -> bool:
    if current_user.is_superuser:
        return True
    if current_user.id == target_user_id:
        return True

    assignments = _active_assignments(
        session=session, user_id=current_user.id, role_name=required_role_name
    )
    if not assignments:
        return False

    target_employment = session.exec(
        select(EmploymentRecord).where(EmploymentRecord.user_id == target_user_id)
    ).first()
    current_employment = session.exec(
        select(EmploymentRecord).where(EmploymentRecord.user_id == current_user.id)
    ).first()

    for assignment in assignments:
        if assignment.scope == RoleAssignmentScope.ALL:
            return True
        if assignment.scope == RoleAssignmentScope.SELF and current_user.id == target_user_id:
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
