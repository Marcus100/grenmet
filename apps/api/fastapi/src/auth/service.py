import uuid
from typing import Any

from sqlmodel import Session, select

from src.auth.models import Permission, Role, User, UserRoleAssignment
from src.auth.schemas import (
    PermissionCreate,
    PermissionUpdate,
    RoleCreate,
    UserCreate,
    UserRoleAssignmentCreate,
    UserRoleAssignmentUpdate,
    UserUpdate,
)
from src.auth.utils import create_access_token, get_password_hash, verify_password


def create_user(*, session: Session, user_create: UserCreate) -> User:
    """Create a new user with hashed password."""
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    """Update user with optional password hashing."""
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    """Get user by email address."""
    statement = select(User).where(User.email == email)
    session_user = session.exec(statement).first()
    return session_user


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    """Authenticate user with email and password."""
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        return None
    if not verify_password(password, db_user.hashed_password):
        return None
    return db_user


# Role management
def create_role(*, session: Session, role_in: RoleCreate) -> Role:
    """Create a new role."""
    db_role = Role.model_validate(role_in)
    session.add(db_role)
    session.commit()
    session.refresh(db_role)
    return db_role


def get_role(*, session: Session, role_id: uuid.UUID) -> Role | None:
    """Get a role by ID."""
    statement = select(Role).where(Role.id == role_id)
    return session.exec(statement).first()


def get_roles(*, session: Session, skip: int = 0, limit: int = 100) -> list[Role]:
    """Get all roles."""
    statement = select(Role).offset(skip).limit(limit)
    return list(session.exec(statement).all())


# Permission management
def create_permission(
    *, session: Session, permission_in: PermissionCreate
) -> Permission:
    """Create a new permission."""
    permission_data = permission_in.model_dump()
    if not permission_data.get("key"):
        permission_data["key"] = (
            f"{permission_in.entity}.{permission_in.action}".strip().lower()
        )
    db_permission = Permission.model_validate(permission_data)
    session.add(db_permission)
    session.commit()
    session.refresh(db_permission)
    return db_permission


def update_permission(
    *, session: Session, db_permission: Permission, permission_in: PermissionUpdate
) -> Permission:
    """Update a permission."""
    permission_data = permission_in.model_dump(exclude_unset=True)
    if (
        "key" not in permission_data
        and ("entity" in permission_data or "action" in permission_data)
    ):
        permission_data["key"] = (
            f"{permission_data.get('entity', db_permission.entity)}."
            f"{permission_data.get('action', db_permission.action)}"
        ).lower()
    db_permission.sqlmodel_update(permission_data)
    session.add(db_permission)
    session.commit()
    session.refresh(db_permission)
    return db_permission


def get_permission(*, session: Session, permission_id: uuid.UUID) -> Permission | None:
    """Get a permission by ID."""
    statement = select(Permission).where(Permission.id == permission_id)
    return session.exec(statement).first()


def get_permissions(
    *, session: Session, skip: int = 0, limit: int = 100
) -> list[Permission]:
    """Get all permissions."""
    statement = select(Permission).offset(skip).limit(limit)
    return list(session.exec(statement).all())


def create_user_role_assignment(
    *, session: Session, assignment_in: UserRoleAssignmentCreate
) -> UserRoleAssignment:
    db_assignment = UserRoleAssignment.model_validate(assignment_in)
    session.add(db_assignment)
    session.commit()
    session.refresh(db_assignment)
    return db_assignment


def update_user_role_assignment(
    *,
    session: Session,
    db_assignment: UserRoleAssignment,
    assignment_in: UserRoleAssignmentUpdate,
) -> UserRoleAssignment:
    assignment_data = assignment_in.model_dump(exclude_unset=True)
    db_assignment.sqlmodel_update(assignment_data)
    session.add(db_assignment)
    session.commit()
    session.refresh(db_assignment)
    return db_assignment


def get_user_role_assignment(
    *, session: Session, assignment_id: uuid.UUID
) -> UserRoleAssignment | None:
    statement = select(UserRoleAssignment).where(UserRoleAssignment.id == assignment_id)
    return session.exec(statement).first()


def get_user_role_assignments(
    *, session: Session, user_id: uuid.UUID | None = None
) -> list[UserRoleAssignment]:
    statement = select(UserRoleAssignment)
    if user_id:
        statement = statement.where(UserRoleAssignment.user_id == user_id)
    return list(session.exec(statement).all())


__all__ = [
    "create_user",
    "update_user",
    "get_user_by_email",
    "authenticate",
    "get_password_hash",
    "verify_password",
    "create_access_token",
    "create_role",
    "get_role",
    "get_roles",
    "create_permission",
    "update_permission",
    "get_permission",
    "get_permissions",
    "create_user_role_assignment",
    "update_user_role_assignment",
    "get_user_role_assignment",
    "get_user_role_assignments",
    "Role",
    "Permission",
    "UserRoleAssignment",
]
