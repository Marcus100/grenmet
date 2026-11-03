"""eRegister exceptions for messages that more than one module raises."""

from fastapi import status

from src.exceptions import AppException, NotFoundError


class ObservationNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Observation not found")


class HourHeldError(AppException):
    """Another observation holds this station and hour (409)."""

    def __init__(self) -> None:
        super().__init__(
            "Another observation now holds this hour; correct that one instead",
            status.HTTP_409_CONFLICT,
        )


class RegisterDatabaseUnavailableError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "eRegister database is unavailable", status.HTTP_503_SERVICE_UNAVAILABLE
        )
