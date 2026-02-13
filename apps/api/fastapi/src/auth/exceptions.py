"""
Authentication-specific exceptions.
"""

from src.auth.constants import AuthErrorCode
from src.exceptions import AppException, AuthenticationError, AuthorizationError


class InvalidCredentialsError(AuthenticationError):
    """Invalid credentials exception."""

    def __init__(self) -> None:
        super().__init__("Invalid email or password")
        self.error_code = AuthErrorCode.INVALID_CREDENTIALS


class UserNotFoundError(AuthenticationError):
    """User not found exception."""

    def __init__(self) -> None:
        super().__init__("User not found")
        self.error_code = AuthErrorCode.USER_NOT_FOUND


class UserInactiveError(AuthenticationError):
    """User inactive exception."""

    def __init__(self) -> None:
        super().__init__("User account is inactive")
        self.error_code = AuthErrorCode.USER_INACTIVE


class UserAlreadyExistsError(AppException):
    """User already exists exception."""

    def __init__(self) -> None:
        super().__init__("User with this email already exists", 409)
        self.error_code = AuthErrorCode.USER_ALREADY_EXISTS


class InvalidTokenError(AuthenticationError):
    """Invalid token exception."""

    def __init__(self) -> None:
        super().__init__("Invalid or malformed token")
        self.error_code = AuthErrorCode.INVALID_TOKEN


class TokenExpiredError(AuthenticationError):
    """Token expired exception."""

    def __init__(self) -> None:
        super().__init__("Token has expired")
        self.error_code = AuthErrorCode.TOKEN_EXPIRED


class InsufficientPermissionsError(AuthorizationError):
    """Insufficient permissions exception."""

    def __init__(self) -> None:
        super().__init__("Insufficient permissions to access this resource")
        self.error_code = AuthErrorCode.INSUFFICIENT_PERMISSIONS
