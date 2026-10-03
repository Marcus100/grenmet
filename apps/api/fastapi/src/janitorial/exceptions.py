from fastapi import status

from src.exceptions import AppException


class JanitorialConflict(AppException):
    """The request conflicts with the current janitorial records (409)."""

    def __init__(self, message: str):
        super().__init__(message, status.HTTP_409_CONFLICT)
