from fastapi import status

from src.exceptions import AppException


class IncidentNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Incident not found", status.HTTP_404_NOT_FOUND)


class IncidentCategoryNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Category not found", status.HTTP_404_NOT_FOUND)


class IncidentChecklistItemNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Checklist item not found", status.HTTP_404_NOT_FOUND)


class IncidentCheckNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Check not found", status.HTTP_404_NOT_FOUND)


class IncidentConflictError(AppException):
    """A change the incident's state refuses (409), for example on a closed one."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class IncidentForbiddenError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_403_FORBIDDEN)
