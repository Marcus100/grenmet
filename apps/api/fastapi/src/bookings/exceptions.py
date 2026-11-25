from fastapi import status

from src.exceptions import AppException


class BookingNotFoundError(AppException):
    def __init__(self, what: str = "Booking resource") -> None:
        super().__init__(f"{what} not found", status.HTTP_404_NOT_FOUND)


class BookingConflictError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class BookingSetupIncompleteError(AppException):
    """409 when a self-created business tries to open online booking before its setup
    checklist is complete (ADR-0066 item 3). ``missing`` names the items, in checklist
    order, so Studio can point at them."""

    def __init__(self, missing: list[str]) -> None:
        names = {
            "services": "an active service",
            "hours": "working hours for someone who offers a service",
            "contact": "a way for customers to reach you",
        }
        listed = ", ".join(names.get(key, key) for key in missing)
        super().__init__(
            f"Finish setting up before opening online booking: add {listed}.",
            status.HTTP_409_CONFLICT,
        )
        self.extra["code"] = "SETUP_INCOMPLETE"
        self.extra["missing"] = list(missing)


class BookingValidationError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_CONTENT)


class SelfSignupDisabledError(AppException):
    """404 while business self sign-up is off (ADR-0066): the same answer as a route that
    does not exist, so nothing about the switch shows."""

    def __init__(self) -> None:
        super().__init__("Not Found", status.HTTP_404_NOT_FOUND)
