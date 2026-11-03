"""Auth exceptions for messages that more than one route raises."""

from fastapi import status

from src.exceptions import AppException, AuthenticationError, AuthorizationError


class SignInAgainError(AuthenticationError):
    def __init__(self) -> None:
        super().__init__("Sign in again")


class PasswordSetupPendingError(AuthorizationError):
    def __init__(self) -> None:
        super().__init__("Finish setting your password before signing in")


class AccountLockedError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Account temporarily locked due to repeated failed logins",
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
