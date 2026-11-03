"""Weather object storage exceptions shared by the storage and wxwatch routes."""

from fastapi import status

from src.exceptions import AppException


class ObjectStorageNotConfiguredError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Weather object storage is not configured",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class InvalidImagePathError(AppException):
    def __init__(self) -> None:
        super().__init__("Invalid image path", status.HTTP_400_BAD_REQUEST)
