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
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY)
