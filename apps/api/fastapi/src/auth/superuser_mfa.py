"""Explicit authenticator requirement for superuser admin powers (owner decision 2026-10-21).

Unlike ``privileged_mfa.require_privileged_mfa`` this does not depend on
``AUTH_PRIVILEGED_MFA_MODE``: the actions that unlock roles or enter a business's
data always need an active superuser who has enrolled an authenticator, in every
environment. Enrolment is checked with the same predicate privileged MFA uses
(TOTP enabled and the secret stored encrypted)."""

from src.auth import totp
from src.auth.models import User
from src.exceptions import AppException

ERROR_CODE = "superuser_mfa_required"


class SuperuserMfaRequiredError(AppException):
    """403: the superuser has not enrolled an authenticator.

    The ``message`` starts with the stable code ``superuser_mfa_required``."""

    code = ERROR_CODE

    def __init__(self) -> None:
        super().__init__(
            f"{ERROR_CODE}: set up two-step verification (an authenticator app) in "
            "account security before using superuser admin powers",
            403,
        )


def has_authenticator(user: User) -> bool:
    return bool(user.totp_enabled and totp.is_encrypted(user.totp_secret))


def require_superuser_mfa(user: User) -> None:
    """Refuse anyone who is not an active superuser with an enrolled authenticator."""
    if not user.is_active or not user.is_superuser:
        raise AppException("Only a superuser can do this", 403)
    if not has_authenticator(user):
        raise SuperuserMfaRequiredError()
