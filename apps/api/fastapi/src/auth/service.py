import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Session as SQLModelSession
from sqlmodel import select

from src.auth.config import auth_settings
from src.auth.models import Permission, Role, User, UserRoleAssignment
from src.auth.models import Session as AuthSession
from src.auth.schemas import (
    PermissionCreate,
    PermissionUpdate,
    RoleCreate,
    SessionCreate,
    UserCreate,
    UserRoleAssignmentCreate,
    UserRoleAssignmentUpdate,
    UserUpdate,
)
from src.auth.utils import (
    create_access_token,
    create_session_token,
    get_password_hash,
    hash_session_token,
    verify_password,
)
from src.utils.datetime import utc_now


def create_user_sync(*, session: SQLModelSession, user_create: UserCreate) -> User:
    """Create a new user with hashed password (sync, for init_db and legacy callers)."""
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


async def create_user(*, session: AsyncSession, user_create: UserCreate) -> User:
    """Create a new user with hashed password."""
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    await session.commit()
    await session.refresh(db_obj)
    return db_obj


async def update_user(*, session: AsyncSession, db_user: User, user_in: UserUpdate) -> Any:
    """Update user with optional password hashing."""
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    await session.commit()
    await session.refresh(db_user)
    return db_user


async def get_user_by_email(*, session: AsyncSession, email: str) -> User | None:
    """Get user by email address."""
    statement = select(User).where(User.email == email)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_user_by_id(*, session: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Get user by ID."""
    statement = select(User).where(User.id == user_id)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_users(
    *, session: AsyncSession, skip: int = 0, limit: int = 100
) -> tuple[list[User], int]:
    """Get users with total count. Returns (list of users, total count)."""
    from sqlmodel import func

    count_stmt = select(func.count()).select_from(User)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0
    list_stmt = select(User).offset(skip).limit(limit)
    list_result = await session.execute(list_stmt)
    users = list(list_result.scalars().all())
    return users, total


async def authenticate(*, session: AsyncSession, email: str, password: str) -> User | None:
    """Authenticate user with email and password."""
    db_user = await get_user_by_email(session=session, email=email)
    if not db_user:
        return None
    if not verify_password(password, db_user.hashed_password):
        return None
    return db_user


def get_legacy_access_token_expires_delta() -> timedelta:
    """Get the existing access-token TTL used by direct-token clients."""
    return timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES)


def get_session_access_token_expires_delta() -> timedelta:
    """Get the short-lived access-token TTL used by session-backed clients."""
    return timedelta(minutes=auth_settings.SESSION_ACCESS_TOKEN_EXPIRE_MINUTES)


def get_session_expires_delta() -> timedelta:
    """Get the persisted session TTL used by web clients."""
    return timedelta(days=auth_settings.SESSION_EXPIRE_DAYS)


def issue_access_token_for_user(
    *, user: User, expires_delta: timedelta | None = None
) -> tuple[str, Any]:
    """Issue an access token and return its expiry timestamp."""
    ttl = expires_delta or get_legacy_access_token_expires_delta()
    expires_at = utc_now() + ttl
    return create_access_token(user.id, expires_delta=ttl), expires_at


def is_session_active(db_session: AuthSession, now: Any | None = None) -> bool:
    """Return whether a stored session is active and usable."""
    current_time = now or utc_now()
    return db_session.revoked_at is None and db_session.expires_at > current_time


async def create_session(
    *,
    session: AsyncSession,
    user: User,
    client_type: str = "web",
    app_name: str | None = None,
    user_agent: str | None = None,
    ip_address: str | None = None,
    expires_delta: timedelta | None = None,
) -> tuple[AuthSession, str]:
    """Create and persist a new opaque session for a user."""
    now = utc_now()
    session_secret = create_session_token()
    db_session = AuthSession.model_validate(
        SessionCreate(
            user_id=user.id,
            session_token=hash_session_token(session_secret),
            expires_at=now + (expires_delta or get_session_expires_delta()),
            client_type=client_type,
            app_name=app_name,
            user_agent=user_agent,
            ip_address=ip_address,
            last_used_at=now,
        )
    )
    session.add(db_session)
    await session.commit()
    await session.refresh(db_session)
    return db_session, session_secret


async def get_session_by_secret(
    *, session: AsyncSession, session_secret: str
) -> AuthSession | None:
    """Look up a persisted session by the raw opaque secret."""
    statement = select(AuthSession).where(
        AuthSession.session_token == hash_session_token(session_secret)
    )
    result = await session.execute(statement)
    return result.scalars().first()


async def get_active_session_by_secret(
    *, session: AsyncSession, session_secret: str
) -> AuthSession | None:
    """Return an active session or None when the secret is invalid, expired, or revoked."""
    db_session = await get_session_by_secret(session=session, session_secret=session_secret)
    if not db_session or not is_session_active(db_session):
        return None
    return db_session


async def touch_session(
    *,
    session: AsyncSession,
    db_session: AuthSession,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> AuthSession:
    """Update activity metadata for a session."""
    now = utc_now()
    db_session.last_used_at = now
    db_session.updated_at = now
    if user_agent is not None:
        db_session.user_agent = user_agent
    if ip_address is not None:
        db_session.ip_address = ip_address
    session.add(db_session)
    await session.commit()
    await session.refresh(db_session)
    return db_session


async def revoke_session(*, session: AsyncSession, db_session: AuthSession) -> AuthSession:
    """Revoke a persisted session."""
    now = utc_now()
    if db_session.revoked_at is None:
        db_session.revoked_at = now
    db_session.updated_at = now
    session.add(db_session)
    await session.commit()
    await session.refresh(db_session)
    return db_session


async def revoke_user_sessions(
    *,
    session: AsyncSession,
    user_id: uuid.UUID,
) -> int:
    """Revoke every active session owned by a user."""
    statement = select(AuthSession).where(
        AuthSession.user_id == user_id,
        AuthSession.revoked_at.is_(None),
    )
    result = await session.execute(statement)
    sessions = list(result.scalars().all())
    if not sessions:
        return 0

    now = utc_now()
    revoked_count = 0
    for db_session in sessions:
        db_session.revoked_at = now
        db_session.updated_at = now
        session.add(db_session)
        revoked_count += 1

    await session.commit()
    return revoked_count


async def exchange_session_for_access_token(
    *,
    session: AsyncSession,
    session_secret: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[AuthSession, User, str, Any] | None:
    """Validate a session, refresh its activity metadata, and mint a short-lived access token."""
    db_session = await get_active_session_by_secret(
        session=session, session_secret=session_secret
    )
    if not db_session:
        return None

    user = await get_user_by_id(session=session, user_id=db_session.user_id)
    if not user or not user.is_active:
        await revoke_session(session=session, db_session=db_session)
        return None

    db_session = await touch_session(
        session=session,
        db_session=db_session,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    access_token, access_token_expires_at = issue_access_token_for_user(
        user=user,
        expires_delta=get_session_access_token_expires_delta(),
    )
    return db_session, user, access_token, access_token_expires_at


async def rotate_session(
    *,
    session: AsyncSession,
    db_session: AuthSession,
    user: User,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[AuthSession, str]:
    """Rotate an active session by revoking it and minting a replacement."""
    await revoke_session(session=session, db_session=db_session)
    return await create_session(
        session=session,
        user=user,
        client_type=db_session.client_type,
        app_name=db_session.app_name,
        user_agent=user_agent or db_session.user_agent,
        ip_address=ip_address or db_session.ip_address,
    )


# Role management
async def create_role(*, session: AsyncSession, role_in: RoleCreate) -> Role:
    """Create a new role."""
    db_role = Role.model_validate(role_in)
    session.add(db_role)
    await session.commit()
    await session.refresh(db_role)
    return db_role


async def get_role(*, session: AsyncSession, role_id: uuid.UUID) -> Role | None:
    """Get a role by ID."""
    statement = select(Role).where(Role.id == role_id)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_roles(*, session: AsyncSession, skip: int = 0, limit: int = 100) -> list[Role]:
    """Get all roles."""
    statement = select(Role).offset(skip).limit(limit)
    result = await session.execute(statement)
    return list(result.scalars().all())


async def get_roles_with_count(
    *, session: AsyncSession, skip: int = 0, limit: int = 100
) -> tuple[list[Role], int]:
    """Get roles with total count. Returns (list of roles, total count)."""
    from sqlmodel import func

    count_stmt = select(func.count()).select_from(Role)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0
    list_stmt = select(Role).offset(skip).limit(limit)
    list_result = await session.execute(list_stmt)
    roles = list(list_result.scalars().all())
    return roles, total


# Permission management
async def create_permission(
    *, session: AsyncSession, permission_in: PermissionCreate
) -> Permission:
    """Create a new permission."""
    permission_data = permission_in.model_dump()
    if not permission_data.get("key"):
        permission_data["key"] = (
            f"{permission_in.entity}.{permission_in.action}".strip().lower()
        )
    db_permission = Permission.model_validate(permission_data)
    session.add(db_permission)
    await session.commit()
    await session.refresh(db_permission)
    return db_permission


async def update_permission(
    *, session: AsyncSession, db_permission: Permission, permission_in: PermissionUpdate
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
    await session.commit()
    await session.refresh(db_permission)
    return db_permission


async def get_permission(*, session: AsyncSession, permission_id: uuid.UUID) -> Permission | None:
    """Get a permission by ID."""
    statement = select(Permission).where(Permission.id == permission_id)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_permissions(
    *, session: AsyncSession, skip: int = 0, limit: int = 100
) -> list[Permission]:
    """Get all permissions."""
    statement = select(Permission).offset(skip).limit(limit)
    result = await session.execute(statement)
    return list(result.scalars().all())


async def get_permissions_with_count(
    *, session: AsyncSession, skip: int = 0, limit: int = 100
) -> tuple[list[Permission], int]:
    """Get permissions with total count. Returns (list of permissions, total count)."""
    from sqlmodel import func

    count_stmt = select(func.count()).select_from(Permission)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0
    list_stmt = select(Permission).offset(skip).limit(limit)
    list_result = await session.execute(list_stmt)
    permissions = list(list_result.scalars().all())
    return permissions, total


async def create_user_role_assignment(
    *, session: AsyncSession, assignment_in: UserRoleAssignmentCreate
) -> UserRoleAssignment:
    db_assignment = UserRoleAssignment.model_validate(assignment_in)
    session.add(db_assignment)
    await session.commit()
    await session.refresh(db_assignment)
    return db_assignment


async def update_user_role_assignment(
    *,
    session: AsyncSession,
    db_assignment: UserRoleAssignment,
    assignment_in: UserRoleAssignmentUpdate,
) -> UserRoleAssignment:
    assignment_data = assignment_in.model_dump(exclude_unset=True)
    db_assignment.sqlmodel_update(assignment_data)
    session.add(db_assignment)
    await session.commit()
    await session.refresh(db_assignment)
    return db_assignment


async def get_user_role_assignment(
    *, session: AsyncSession, assignment_id: uuid.UUID
) -> UserRoleAssignment | None:
    statement = select(UserRoleAssignment).where(UserRoleAssignment.id == assignment_id)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_user_role_assignments(
    *, session: AsyncSession, user_id: uuid.UUID | None = None
) -> list[UserRoleAssignment]:
    statement = select(UserRoleAssignment)
    if user_id:
        statement = statement.where(UserRoleAssignment.user_id == user_id)
    result = await session.execute(statement)
    return list(result.scalars().all())


__all__ = [
    "create_user",
    "update_user",
    "get_user_by_email",
    "get_user_by_id",
    "authenticate",
    "get_password_hash",
    "verify_password",
    "create_access_token",
    "create_session",
    "exchange_session_for_access_token",
    "get_active_session_by_secret",
    "get_legacy_access_token_expires_delta",
    "get_session_access_token_expires_delta",
    "get_session_by_secret",
    "get_session_expires_delta",
    "is_session_active",
    "issue_access_token_for_user",
    "revoke_session",
    "revoke_user_sessions",
    "rotate_session",
    "touch_session",
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
