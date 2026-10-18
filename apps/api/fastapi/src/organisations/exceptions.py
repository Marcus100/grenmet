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
