from fastapi import status

from src.exceptions import AppException


class ContactNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Contact not found", status.HTTP_404_NOT_FOUND)


class ContactMergeError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class ContactErasedError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This contact has been erased and cannot be changed",
            status.HTTP_409_CONFLICT,
        )
