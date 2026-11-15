"""Auth exceptions for messages that more than one route raises."""

from fastapi import status

from src.exceptions import AppException, AuthenticationError, AuthorizationError


class SignInAgainError(AuthenticationError):
    def __init__(self) -> None:
        super().__init__("Sign in again")


class PasswordSetupPendingError(AuthorizationError):
    def __init__(self) -> None:
        super().__init__("Finish setting your password before signing in")


class SuperuserByInvitationError(AppException):
    """403: superuser status is never granted by a generic route (ADR-0059 rule 1)."""

    def __init__(self) -> None:
        super().__init__(
            "Superuser access is granted only by invitation. Send one from the admin "
            "app (POST /api/v1/auth/superuser-invitations).",
            status.HTTP_403_FORBIDDEN,
        )


class LastSuperuserError(AppException):
    """409: removing this superuser would leave no active superuser."""

    def __init__(self) -> None:
        super().__init__(
            "At least one other active superuser must remain. Invite another superuser "
            "first (POST /api/v1/auth/superuser-invitations).",
            status.HTTP_409_CONFLICT,
        )


class AccountLockedError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Account temporarily locked due to repeated failed logins",
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
