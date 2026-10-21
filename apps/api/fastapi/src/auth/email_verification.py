"""Email verification gates for money and power (ADR-0018, owner decision 2026-10-20).

Sign-in and browsing never require a verified email. It is required before:
paying a deposit, receiving a staff or admin role or membership, and changing
payout details. Call ``require_verified_email`` from the service function that
performs the action, never from a sign-in dependency.
"""

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
