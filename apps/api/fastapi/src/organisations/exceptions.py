from fastapi import status

from src.exceptions import AppException


class OrganisationContextRequiredError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "The X-Barrels-Organisation header is required", status.HTTP_400_BAD_REQUEST
        )


class OrganisationNotFoundError(AppException):
    """Also raised for non-members so an organisation's existence is not leaked."""

    def __init__(self) -> None:
        super().__init__("Organisation not found", status.HTTP_404_NOT_FOUND)


class OrganisationRoleError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Your role in this organisation does not allow this",
            status.HTTP_403_FORBIDDEN,
        )


class OrganisationSuspendedError(AppException):
    def __init__(self) -> None:
        super().__init__("This organisation is suspended", status.HTTP_403_FORBIDDEN)


class MembershipNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Member not found", status.HTTP_404_NOT_FOUND)


class InvitationNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Invitation not found", status.HTTP_404_NOT_FOUND)


class InvitationInvalidError(AppException):
    """Unknown, expired, used or revoked: one message so a token reveals nothing."""

    def __init__(self) -> None:
        super().__init__(
            "This invitation is invalid or has expired", status.HTTP_400_BAD_REQUEST
        )


class InvitationEmailMismatchError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This invitation was sent to a different email address",
            status.HTTP_403_FORBIDDEN,
        )


class AlreadyMemberError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "That person is already a member of this organisation",
            status.HTTP_409_CONFLICT,
        )


class LastOwnerError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "An organisation must keep at least one owner", status.HTTP_409_CONFLICT
        )


class InvitationAcceptedError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This invitation has already been accepted", status.HTTP_409_CONFLICT
        )
