from fastapi import status

from src.exceptions import AppException


class NotEntitledError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Your organisation does not have GMS Dashboard access",
            status.HTTP_403_FORBIDDEN,
        )


class UnknownPointError(AppException):
    def __init__(self) -> None:
        super().__init__("Unknown forecast point", status.HTTP_404_NOT_FOUND)


class UnknownModelError(AppException):
    def __init__(self) -> None:
        super().__init__("Unknown model", status.HTTP_404_NOT_FOUND)


class NoGuidanceYetError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "No stored run for this model and point yet", status.HTTP_404_NOT_FOUND
        )


class AccessRequestPendingError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "An access request for this organisation is already pending",
            status.HTTP_409_CONFLICT,
        )


class AlreadyEntitledError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This organisation already has GMS Dashboard access",
            status.HTTP_409_CONFLICT,
        )


class AccessRequestNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Access request not found", status.HTTP_404_NOT_FOUND)


class AccessRequestDecidedError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This access request has already been decided", status.HTTP_409_CONFLICT
        )
