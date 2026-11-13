"""Typed errors of the profile_images domain (#1303)."""

from src.exceptions import AppException


class ProfileImageInvalidError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=422)


class ProfileImageTooLargeError(AppException):
    def __init__(self) -> None:
        super().__init__("The photo must be 5 MB or smaller.", status_code=413)


class ProfileImageTypeError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Send the photo as image/jpeg, image/png or image/webp.", status_code=415
        )


class ProfileImageNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("No profile photo.", status_code=404)


class ProfileImageForbiddenError(AppException):
    def __init__(self) -> None:
        super().__init__("You cannot remove this profile photo.", status_code=403)


class ProfileImageStorageUnavailableError(AppException):
    def __init__(self) -> None:
        super().__init__("Profile photos are not available right now.", status_code=503)
