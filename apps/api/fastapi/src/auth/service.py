import logging
from typing import Any

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SQLAlchemySession

from src.auth.assignments import (
    audit_assignment,
    create_user_role_assignment,
    delegation_authority,
    delete_user_role_assignment,
    get_user_role_assignment,
    get_user_role_assignments,
    require_assignment_management,
    require_user_management,
    update_user_role_assignment,
)
from src.auth.config import auth_settings
from src.auth.eligibility import (
    has_effective_permission,
    is_eligible_for_app,
    is_staff_eligible,
    request_staff_access,
    require_approved_account,
)
from src.auth.models import Session as AuthSession
from src.auth.models import (
    User,
)
from src.auth.roles import (
    count_role_assignments_for_role,
    create_permission,
    create_role,
    delete_role,
    get_permission,
    get_permissions_with_count,
    get_role,
    get_roles_with_count,
    update_permission,
    update_role,
)
from src.auth.schemas import (
    UserCreate,
    UserUpdate,
    UserUpdateMe,
)
from src.auth.sessions import (
    create_session,
    exchange_session_for_access_token,
    get_active_session_by_secret,
    get_legacy_access_token_expires_delta,
    get_session_access_token_expires_delta,
    get_session_by_secret,
    get_session_expires_delta,
    is_session_active,
    issue_access_token_for_user,
    revoke_session,
    revoke_user_sessions,
    rotate_session,
    touch_session,
)
from src.auth.totp_enrolment import (
    activate_totp,
    begin_totp_setup,
    disable_totp,
    enrolment_needs_email_code,
)
from src.auth.user_queries import (
    get_user_by_email,
    get_user_by_id,
    get_users,
    get_users_by_ids,
)
from src.auth.utils import (
    DUMMY_PASSWORD_HASH,
    get_password_hash,
    get_password_hash_async,
    verify_password_async,
)
from src.exceptions import AppException
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

__all__ = [
    "activate_totp",
    "audit_assignment",
    "begin_totp_setup",
    "enrolment_needs_email_code",
    "count_role_assignments_for_role",
    "create_permission",
    "create_role",
    "create_session",
    "create_user_role_assignment",
    "delegation_authority",
    "delete_role",
    "delete_user_role_assignment",
    "disable_totp",
    "exchange_session_for_access_token",
    "get_active_session_by_secret",
    "get_legacy_access_token_expires_delta",
    "get_permission",
    "get_permissions_with_count",
    "get_role",
    "get_roles_with_count",
    "get_session_access_token_expires_delta",
    "get_session_by_secret",
    "get_session_expires_delta",
    "get_user_by_email",
    "get_user_by_id",
    "get_user_role_assignment",
    "get_user_role_assignments",
    "get_users",
    "get_users_by_ids",
    "has_effective_permission",
    "is_eligible_for_app",
    "is_session_active",
    "is_staff_eligible",
    "issue_access_token_for_user",
    "request_staff_access",
    "require_approved_account",
    "require_assignment_management",
    "require_user_management",
    "revoke_session",
    "revoke_user_sessions",
    "rotate_session",
    "touch_session",
    "update_permission",
    "update_role",
    "update_user_role_assignment",
]


def create_user_sync(*, session: SQLAlchemySession, user_create: UserCreate) -> User:
    """Create a new user with hashed password (sync, for init_db and legacy callers)."""
    db_obj = User(
        **user_create.model_dump(exclude={"password"}),
        hashed_password=get_password_hash(user_create.password),
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


async def create_user(*, session: AsyncSession, user_create: UserCreate) -> User:
    """Create a new user with hashed password."""
    hashed_password = await get_password_hash_async(user_create.password)
    db_obj = User(
        **user_create.model_dump(exclude={"password"}),
        hashed_password=hashed_password,
    )
    if auth_settings.ENVIRONMENT != "local":
        db_obj.email_verification_required = True
    session.add(db_obj)
    await session.commit()
    await session.refresh(db_obj)
    logger.info(
        "User created", extra={"user_id": str(db_obj.id), "email": db_obj.email}
    )
    return db_obj


async def update_user(
    *, session: AsyncSession, db_user: User, user_in: UserUpdate
) -> Any:
    """Update user with optional password hashing."""
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = await get_password_hash_async(password)
        extra_data["hashed_password"] = hashed_password
    if user_in.email and user_in.email != db_user.email:
        db_user.email_verified_at = None
        db_user.email_verification_required = True
    for key, value in {**user_data, **extra_data}.items():
        if key != "password":
            setattr(db_user, key, value)
    if (
        user_data.get("is_active") is False
        or "password" in user_data
        or "email" in user_data
    ):
        await session.execute(
            delete(AuthSession).where(AuthSession.user_id == db_user.id)
        )
    if "cms_access" in user_data:
        await session.execute(
            delete(AuthSession).where(
                AuthSession.user_id == db_user.id, AuthSession.app_name == "cms"
            )
        )
    session.add(db_user)
    await session.commit()
    await session.refresh(db_user)
    return db_user


async def update_user_me(
    *, session: AsyncSession, current_user: User, user_in: UserUpdateMe
) -> User:
    if user_in.email:
        existing = await get_user_by_email(session=session, email=user_in.email)
        if existing and existing.id != current_user.id:
            raise AppException("User with this email already exists", 409)
    user_data = user_in.model_dump(exclude_unset=True)
    if user_in.email and user_in.email != current_user.email:
        current_user.email_verified_at = None
        current_user.email_verification_required = True
        await session.execute(
            delete(AuthSession).where(AuthSession.user_id == current_user.id)
        )
    for key, value in user_data.items():
        setattr(current_user, key, value)
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user


async def set_password(*, session: AsyncSession, user: User, new_password: str) -> None:
    user.hashed_password = await get_password_hash_async(new_password)
    user.password_changed_at = utc_now()
    session.add(user)
    from src.auth.modern_models import AuthChallenge

    await session.execute(delete(AuthChallenge).where(AuthChallenge.user_id == user.id))
    await session.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    await session.commit()
    logger.info("Password changed", extra={"user_id": str(user.id)})


async def update_password(
    *, session: AsyncSession, user: User, current_password: str, new_password: str
) -> None:
    if not await verify_password_async(current_password, user.hashed_password):
        raise AppException("Incorrect password", 400)
    if current_password == new_password:
        raise AppException("New password must be different from current password", 400)
    await set_password(session=session, user=user, new_password=new_password)


async def delete_user(*, session: AsyncSession, user: User) -> None:
    user_id = str(user.id)
    from src.auth.modern_models import AuthChallenge

    # Outstanding activation/sign-in challenges must not block account deletion.
    await session.execute(delete(AuthChallenge).where(AuthChallenge.user_id == user.id))
    await session.delete(user)
    await session.commit()
    logger.info("User deleted", extra={"user_id": user_id})


async def authenticate(
    *, session: AsyncSession, email: str, password: str
) -> User | None:
    """Authenticate user with email and password."""
    db_user = await get_user_by_email(session=session, email=email)
    if not db_user:
        # Equalize timing with the found-user path so a missing account is not
        # distinguishable from a wrong password by response latency.
        await verify_password_async(password, DUMMY_PASSWORD_HASH)
        return None
    if not await verify_password_async(password, db_user.hashed_password):
        return None
    return db_user
