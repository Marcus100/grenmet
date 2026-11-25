from fastapi import status

from src.exceptions import AppException


class BookingNotFoundError(AppException):
    def __init__(self, what: str = "Booking resource") -> None:
        super().__init__(f"{what} not found", status.HTTP_404_NOT_FOUND)


class BookingConflictError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class BookingValidationError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_CONTENT)


class SelfSignupDisabledError(AppException):
    """404 while business self sign-up is off (ADR-0066): the same answer as a route that
    does not exist, so nothing about the switch shows."""

    def __init__(self) -> None:
        super().__init__("Not Found", status.HTTP_404_NOT_FOUND)
