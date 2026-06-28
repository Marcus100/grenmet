"""
Authentication module constants.

This module contains all constants used throughout the auth module.
Centralizing constants makes the codebase easier to maintain and reduces magic strings.
"""

# Token settings
TOKEN_TYPE_BEARER = "bearer"
TOKEN_ALGORITHM = "HS256"

# HTTP Status codes for auth operations
HTTP_400_BAD_REQUEST = 400
HTTP_401_UNAUTHORIZED = 401
HTTP_403_FORBIDDEN = 403
HTTP_404_NOT_FOUND = 404
HTTP_409_CONFLICT = 409


# Error codes
class AuthErrorCode:
    INVALID_CREDENTIALS = "invalid_credentials"
    USER_NOT_FOUND = "user_not_found"
    INACTIVE_USER = "inactive_user"
    USER_INACTIVE = "user_inactive"
    USER_ALREADY_EXISTS = "user_already_exists"
    INVALID_TOKEN = "invalid_token"
    INVALID_SESSION = "invalid_session"
    TOKEN_EXPIRED = "token_expired"
    INSUFFICIENT_PERMISSIONS = "insufficient_permissions"


# Error messages
ERROR_INCORRECT_CREDENTIALS = "Incorrect email or password"
ERROR_INACTIVE_USER = "Inactive user"
ERROR_INSUFFICIENT_PRIVILEGES = "The user doesn't have enough privileges"
ERROR_USER_NOT_FOUND = "User not found"
ERROR_USER_EXISTS = "The user with this email already exists in the system."
ERROR_EMAIL_EXISTS = "User with this email already exists"
ERROR_INVALID_TOKEN = "Invalid token"
ERROR_INVALID_CREDENTIALS = "Could not validate credentials"
ERROR_INVALID_SESSION = "Invalid or expired session"
ERROR_PASSWORD_SAME = "New password cannot be the same as the current one"
ERROR_PASSWORD_INCORRECT = "Incorrect password"
ERROR_SUPERUSER_DELETE_SELF = "Super users are not allowed to delete themselves"

# Success messages
SUCCESS_PASSWORD_UPDATED = "Password updated successfully"
SUCCESS_PASSWORD_RECOVERY_SENT = "Password recovery email sent"
SUCCESS_USER_DELETED = "User deleted successfully"
SUCCESS_LOGGED_OUT = "Signed out successfully"
SUCCESS_LOGGED_OUT_ALL = "Signed out from all sessions successfully"

# User field constraints
MIN_USERNAME_LENGTH = 3
MAX_USERNAME_LENGTH = 255
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 40
MIN_NAME_LENGTH = 1
MAX_NAME_LENGTH = 100
MAX_EMAIL_LENGTH = 255

ERROR_PERMISSION_NOT_FOUND = "Permission not found"
ERROR_ROLE_NOT_FOUND = "Role not found"
ERROR_ROLE_ASSIGNMENT_NOT_FOUND = "Role assignment not found"

# Default pagination values
DEFAULT_SKIP = 0
DEFAULT_LIMIT = 100
