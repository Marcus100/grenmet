import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SQLAlchemySession

from src.auth import placeholders
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
    ensure_email_change_allowed,
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
from src.exceptions import AppException, AuthorizationError
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
    placeholders.require_usable_identity(
        email=user_create.email, username=user_create.username
    )
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
    placeholders.require_usable_identity(email=user_in.email, username=user_in.username)
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = await get_password_hash_async(password)
        extra_data["hashed_password"] = hashed_password
    if user_in.email and user_in.email != db_user.email:
        await ensure_email_change_allowed(session=session, user=db_user)
        db_user.email_verified_at = None
        db_user.email_verification_required = True
        await _unlink_business_contacts(session, db_user.id)
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
    placeholders.require_usable_identity(email=user_in.email, username=user_in.username)
    if user_in.email:
        existing = await get_user_by_email(session=session, email=user_in.email)
        if existing and existing.id != current_user.id:
            raise AppException("User with this email already exists", 409)
    user_data = user_in.model_dump(exclude_unset=True)
    if user_in.email and user_in.email != current_user.email:
        await ensure_email_change_allowed(session=session, user=current_user)
        current_user.email_verified_at = None
        current_user.email_verification_required = True
        await _unlink_business_contacts(session, current_user.id)
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


async def _unlink_business_contacts(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Drop the account link on every business contact (ADR-0058). Lazy import:
    the contacts domain sits above auth in the import graph."""
    from src.contacts import service as contacts_service

    await contacts_service.unlink_account(session, user_id)


async def _end_access_links(
    session: AsyncSession, user_id: uuid.UUID, now: datetime
) -> None:
    """Remove plain role links and end live role assignments (history stays)."""
    from src.auth.models import UserRoleAssignment, UserRoleLink

    await session.execute(delete(UserRoleLink).where(UserRoleLink.user_id == user_id))
    await session.execute(
        update(UserRoleAssignment)
        .where(
            UserRoleAssignment.user_id == user_id,
            or_(
                UserRoleAssignment.effective_to.is_(None),
                UserRoleAssignment.effective_to > now,
            ),
        )
        .values(effective_to=now)
    )


async def _end_organisation_access(
    session: AsyncSession, user_id: uuid.UUID, now: datetime
) -> None:
    """Mark every membership removed and revoke its live grants. Rows stay for history."""
    from src.organisations.models import Membership, MembershipGrant, MembershipStatus

    await session.execute(
        update(Membership)
        .where(
            Membership.user_id == user_id,
            Membership.status != MembershipStatus.REMOVED.value,
        )
        .values(status=MembershipStatus.REMOVED.value, updated_at=now)
    )
    await session.execute(
        update(MembershipGrant)
        .where(
            MembershipGrant.membership_id.in_(
                select(Membership.id).where(Membership.user_id == user_id)
            ),
            MembershipGrant.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )


async def require_no_live_employment(session: AsyncSession, user: User) -> None:
    """Refuse self-deletion while the person is still employed (owner decision,
    14 Nov 2026). HR ends the employment first, and the account is then deleted."""
    from src.hr.models import EmploymentRecord, live_employment_clause
    from src.utils.timezones import local_today

    live = await session.scalar(
        select(EmploymentRecord.id)
        .where(
            EmploymentRecord.user_id == user.id, live_employment_clause(local_today())
        )
        .limit(1)
    )
    if live is not None:
        raise AuthorizationError(
            "You are still employed. Contact HR before deleting your account."
        )


async def _clear_hr_personal_details(
    session: AsyncSession, user_id: uuid.UUID, now: datetime
) -> None:
    """Owner decision (14 Nov 2026), ADR-0058 section 7. Contact details always go.
    Date of birth and the address are kept for a person who has or had an employment
    record, for six years after employment ends (provisional, pending GAA), and removed
    for anyone else. Employment, pay, leave and attendance records are not touched.

    Core statements, not ORM changes: the HR audit tracks these tables, and an ORM
    change would store the old phone number or birth date in the audit trail."""
    from src.hr.models import EmploymentRecord, UserAddress, UserProfile

    employed_before = (
        await session.scalar(
            select(EmploymentRecord.id)
            .where(EmploymentRecord.user_id == user_id)
            .limit(1)
        )
        is not None
    )
    values: dict[str, Any] = {
        "phone": None,
        "emergency_contact_name": None,
        "emergency_contact_phone": None,
        "emergency_contact_relationship": None,
        "gender": None,
        "nationality": None,
        "updated_at": now,
    }
    if not employed_before:
        values["date_of_birth"] = None
    await session.execute(
        update(UserProfile).where(UserProfile.user_id == user_id).values(**values)
    )
    if not employed_before:
        await session.execute(delete(UserAddress).where(UserAddress.user_id == user_id))


def is_anonymised(user: User) -> bool:
    """True only for an account ``delete_user`` has really anonymised. Every marker is
    one a person cannot set: deactivation, the shared password hash only the
    anonymiser writes, and the placeholder email and username (refused on every write
    path). An account that someone else deactivated with a placeholder email still
    gets the full deletion."""
    return (
        not user.is_active
        and user.hashed_password == DUMMY_PASSWORD_HASH
        and placeholders.is_placeholder_email(user.email)
        and placeholders.is_placeholder_username(user.username)
    )


async def _new_placeholder_token(session: AsyncSession) -> str:
    """A random token that no account's placeholder uses yet. The draw is random, so a
    collision is practically impossible; the check repeats the draw if one ever occurs."""
    for _ in range(5):
        token = placeholders.new_placeholder_token()
        taken = await session.scalar(
            select(User.id).where(
                or_(
                    User.email == placeholders.placeholder_email(token),
                    User.username == placeholders.placeholder_username(token),
                )
            )
        )
        if taken is None:
            return token
    raise AppException("The account could not be anonymised. Try again.", 503)


def _anonymise_fields(user: User, token: str, now: datetime) -> None:
    """Replace the personal fields and deactivate the account (ADR-0058 section 7).

    The email and username are unique, so they become random placeholders on
    ``example.com`` (reserved for documentation, never delivered). The password hash
    becomes ``DUMMY_PASSWORD_HASH``, a real bcrypt hash of a random secret that nobody
    holds, so no sign-in can match it.
    """
    user.email = placeholders.placeholder_email(token)
    user.username = placeholders.placeholder_username(token)
    user.first_name = "Deleted"
    user.last_name = "user"
    user.middle_name = None
    user.title = None
    user.phone_e164 = None
    user.phone_verified_at = None
    user.email_verified_at = None
    user.email_verification_required = False
    user.password_setup_pending = False
    user.registration_pending = False
    user.staff_access_requested_at = None
    user.last_login_at = None
    user.password_changed_at = None
    user.hashed_password = DUMMY_PASSWORD_HASH
    user.totp_secret = None
    user.totp_enabled = False
    user.mfa_recovery_hashes = []
    user.is_active = False
    user.is_superuser = False
    user.cms_access = "none"
    user.updated_at = now


async def delete_user(
    *, session: AsyncSession, user: User, actor: User | None = None
) -> None:
    """Anonymise an account instead of deleting its row (ADR-0058 section 7, #1375).

    The row stays under the same id because other tables reference it: the rewards
    ledger, HR employment and pay records, and the audit trail. A hard delete was
    refused (409) for any of them, and a cascade would have removed records the law may
    require. So access and personal data go: sessions, API keys it created, Google
    sign-ins, the authenticator and recovery codes, remembered devices, roles,
    memberships, notification history, the photo and any open redemption code. The
    account is deactivated, which every token check refuses. The deletion is audited
    with no personal value.
    """
    from src.audit import service as audit
    from src.auth.app_service import revoke_access_material
    from src.auth.models import UserImage
    from src.auth.modern_models import AuthChallenge
    from src.baseline.models import StaffCredential
    from src.notifications.models import Notification, NotificationPreference
    from src.profile_images import service as profile_images
    from src.rewards import service as rewards_service

    if is_anonymised(user):
        # Already done: no second pass and no second audit row.
        logger.info("User already anonymised", extra={"user_id": str(user.id)})
        return
    user_id = user.id
    actor_id = (actor or user).id
    now = utc_now()
    token = await _new_placeholder_token(session)
    audit.set_actor(session, actor_id)
    # Outstanding activation/sign-in challenges must not outlive the account.
    await session.execute(delete(AuthChallenge).where(AuthChallenge.user_id == user_id))
    # The photo row is removed here (no cascade now); its stored files go after commit.
    photo = await profile_images.get_image(session=session, user_id=user_id)
    photo_prefix = photo.object_key if photo else None
    await session.execute(delete(UserImage).where(UserImage.user_id == user_id))
    await _unlink_business_contacts(session, user_id)
    # Sessions, Google sign-ins, remembered devices and API keys the account created.
    await revoke_access_material(session, user)
    await rewards_service.cancel_open_redemptions(session, account=user)
    await _end_access_links(session, user_id, now)
    await _end_organisation_access(session, user_id, now)
    await _clear_hr_personal_details(session, user_id, now)
    await session.execute(
        update(StaffCredential)
        .where(StaffCredential.user_id == user_id, StaffCredential.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await session.execute(
        delete(Notification).where(Notification.recipient_user_id == user_id)
    )
    await session.execute(
        delete(NotificationPreference).where(NotificationPreference.user_id == user_id)
    )
    _anonymise_fields(user, token, now)
    # The helpers above change the session's actor (the redemption reversal names the
    # account, and the contact link restores what it found). The deletion is the
    # actor's act, so name them again before the audit row is written.
    audit.set_actor(session, actor_id)
    await audit.record_change(
        session,
        entity_type="account",
        entity_id=str(user_id),
        record_type="account_deletion",
        record_id=str(user_id),
        action="anonymised",
        changes={"account": (None, "anonymised")},
    )
    await session.commit()
    if photo_prefix:
        await profile_images.delete_stored_files(photo_prefix)
    logger.info("User anonymised", extra={"user_id": str(user_id)})


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
