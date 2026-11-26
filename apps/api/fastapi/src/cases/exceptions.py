from fastapi import status

from src.exceptions import AppException


class CaseNotFoundError(AppException):
    def __init__(self, what: str = "Case") -> None:
        super().__init__(f"{what} not found", status.HTTP_404_NOT_FOUND)


class CaseProgrammeNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Programme not found", status.HTTP_404_NOT_FOUND)


class CaseConflictError(AppException):
    """A change the case's state or the risk rules refuse (409)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class CaseForbiddenError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_403_FORBIDDEN)
