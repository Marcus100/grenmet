from fastapi import status

from src.exceptions import AppException


class OpsLogNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Log not found", status.HTTP_404_NOT_FOUND)


class OpsLogCategoryNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Category not found", status.HTTP_404_NOT_FOUND)


class OpsLogEntryNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Entry not found", status.HTTP_404_NOT_FOUND)


class OpsLogConflictError(AppException):
    """A write the log's rules or state refuse (409)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class OpsLogForbiddenError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_403_FORBIDDEN)
