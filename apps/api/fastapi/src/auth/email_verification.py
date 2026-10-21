"""Email verification gates for money and power (ADR-0018, owner decision 2026-10-20).

Sign-in and browsing never require a verified email. It is required before:
paying a deposit, receiving a staff or admin role or membership, and changing
payout details. Call ``require_verified_email`` from the service function that
performs the action, never from a sign-in dependency.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import User
from src.exceptions import AppException

ERROR_CODE = "email_verification_required"


class EmailNotVerifiedError(AppException):
    """403: the action needs a verified email address on the account.

    The ``detail`` starts with the stable code ``email_verification_required``
    so clients can branch on it, followed by a readable reason."""

    code = ERROR_CODE

    def __init__(self, action: str):
        super().__init__(
            f"{ERROR_CODE}: verify your email address before you {action}", 403
        )


def is_email_verified(user: User) -> bool:
    return user.email_verified_at is not None


def require_verified_email(user: User, action: str) -> None:
    if not is_email_verified(user):
        raise EmailNotVerifiedError(action)


async def is_admin_activated(session: AsyncSession, user: User) -> bool:
    """True when an administrator activated this account (onboarding.confirm_activation).

    That flow leaves ``email_verified_at`` empty on purpose; the administrator who
    issued the activation link vouches for the account (owner decision 2026-10-21).
    The marker is the ``account_activation`` / ``activated`` audit entry that only
    ``confirm_activation`` writes, and it only does so for a link issued by an
    active superuser. Self-registered accounts never have one."""
    found = await session.scalar(
        select(AuditEntry.id)
        .where(
            AuditEntry.record_type == "account_activation",
            AuditEntry.record_id == str(user.id),
            AuditEntry.action == "activated",
        )
        .limit(1)
    )
    return found is not None


async def require_verified_or_admin_activated(
    session: AsyncSession, user: User, action: str
) -> None:
    """Gate for staff roles and owner/admin memberships: a verified email, or an
    account an administrator activated. Deposits stay strict (``require_verified_email``)."""
    if is_email_verified(user) or await is_admin_activated(session, user):
        return
    raise EmailNotVerifiedError(action)
