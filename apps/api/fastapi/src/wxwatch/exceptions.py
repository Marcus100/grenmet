"""Weather image and edition exceptions for messages raised from more than one route."""

from fastapi import status

from src.exceptions import AppException, NotFoundError


class ImageMetadataUnavailableError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Weather image metadata is unavailable",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class ImageNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Image not found")


class EditionNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Edition not found")
