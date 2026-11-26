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


#: Stable prefix of the detail for a changed email with no proof (#1535). Clients branch
#: on it; the readable reason follows it.
EMAIL_CHANGE_PROOF_CODE = "email_change_proof_required"


class EmailChangeProofRequiredError(AppException):
    """400: changing the account email needs the current password (or, for an account
    with no password, a code sent to the current address)."""

    def __init__(self, *, by_code: bool) -> None:
        if by_code:
            reason = "Request a code to your current email address, then enter it"
        else:
            reason = "Enter your current password"
        super().__init__(
            f"{EMAIL_CHANGE_PROOF_CODE}: {reason} to change your email address.",
            status.HTTP_400_BAD_REQUEST,
        )


class CurrentPasswordIncorrectError(AppException):
    """400: the current password given to change the account email is wrong."""

    def __init__(self) -> None:
        super().__init__(
            "Your current password is not correct.", status.HTTP_400_BAD_REQUEST
        )


class EmailChangeUsesPasswordError(AppException):
    """400: this account signs in with a password, so a code is not the proof."""

    def __init__(self) -> None:
        super().__init__(
            "This account signs in with a password. Enter your current password to "
            "change your email address.",
            status.HTTP_400_BAD_REQUEST,
        )


class EmailChangeRateLimitedError(AppException):
    """429: too many email change attempts or code requests for this account."""

    def __init__(
        self,
        message: str = "Too many email change attempts. Try again later.",
    ) -> None:
        super().__init__(message, status.HTTP_429_TOO_MANY_REQUESTS)


class PhoneNumberTakenError(AppException):
    """409: another account already holds this phone number (it is unique)."""

    def __init__(self) -> None:
        super().__init__(
            "That phone number is already on another account. Use another number.",
            status.HTTP_409_CONFLICT,
        )
