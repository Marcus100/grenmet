from fastapi import status

from src.exceptions import AppException


class TransportConflict(AppException):
    """The request conflicts with the current state of the timetable."""

    def __init__(self, message: str):
        super().__init__(message, status.HTTP_409_CONFLICT)


class TimetableUnavailableError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Transport timetable is unavailable", status.HTTP_503_SERVICE_UNAVAILABLE
        )
