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


class OrganisationAppNotEntitledError(AppException):
    """Only raised after membership is proven, so it reveals nothing to outsiders."""

    def __init__(self) -> None:
        super().__init__(
            "This organisation is not entitled to this app",
            status.HTTP_403_FORBIDDEN,
        )


class PublicSiteNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Site not found", status.HTTP_404_NOT_FOUND)


class SecretStorageUnavailableError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Secret storage is not configured; contact the platform operator",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class ApiKeyInvalidError(AppException):
    """Unknown, malformed, expired or revoked: one message so a key reveals nothing."""

    def __init__(self) -> None:
        super().__init__("Invalid or expired API key", status.HTTP_401_UNAUTHORIZED)


class ApiKeyRateLimitedError(AppException):
    def __init__(self) -> None:
        super().__init__("Too many requests", status.HTTP_429_TOO_MANY_REQUESTS)


class ApiKeyScopeMissingError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This API key does not have the required scope", status.HTTP_403_FORBIDDEN
        )


class ApiKeyScopeInvalidError(AppException):
    def __init__(self, scope: str) -> None:
        super().__init__(
            f"Unknown API key scope: {scope}", status.HTTP_422_UNPROCESSABLE_CONTENT
        )


class ApiKeyScopeNotAllowedError(AppException):
    """The organisation is not entitled to the scope's product, so no key may hold it."""

    def __init__(self, scope: str) -> None:
        super().__init__(
            f"This organisation cannot grant the scope {scope}",
            status.HTTP_403_FORBIDDEN,
        )


class ApiKeyNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("API key not found", status.HTTP_404_NOT_FOUND)


class ApiKeyNotActiveError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This API key is revoked or expired and cannot be rotated",
            status.HTTP_409_CONFLICT,
        )


class OrganisationPermissionError(AppException):
    """The member's roles in this organisation do not include the required key."""

    def __init__(self) -> None:
        super().__init__(
            "Your roles in this organisation do not allow this",
            status.HTTP_403_FORBIDDEN,
        )


class RoleBundleUnknownError(AppException):
    def __init__(self, role_key: str) -> None:
        super().__init__(
            f"Unknown organisation role: {role_key}",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )


class GrantExpiryInvalidError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "A grant must expire in the future", status.HTTP_422_UNPROCESSABLE_CONTENT
        )


class GrantNotHeldError(AppException):
    """The grantor does not hold every key of the bundle and the team-manage key."""

    def __init__(self) -> None:
        super().__init__(
            "You can only change roles whose permissions you hold yourself",
            status.HTTP_403_FORBIDDEN,
        )


class GrantNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Role grant not found", status.HTTP_404_NOT_FOUND)


class RoleAlreadyGrantedError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "That member already holds this role", status.HTTP_409_CONFLICT
        )


class SelfGrantError(AppException):
    def __init__(self) -> None:
        super().__init__("You cannot change your own roles", status.HTTP_403_FORBIDDEN)


class GrantExpiryExceedsGrantorError(AppException):
    """The grantor's own access to the bundle ends sooner than the new grant would."""

    def __init__(self) -> None:
        super().__init__(
            "This grant cannot outlast your own access to the role",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )


class GrantConflictError(AppException):
    """Another request changed the same member's roles at the same moment."""

    def __init__(self) -> None:
        super().__init__(
            "Roles for this member changed at the same time; try again",
            status.HTTP_409_CONFLICT,
        )
