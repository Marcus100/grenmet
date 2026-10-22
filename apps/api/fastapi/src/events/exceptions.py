from src.exceptions import AppException


class EventsNotFound(AppException):
    def __init__(self, what: str = "Not found") -> None:
        super().__init__(what, 404)


class EventsForbidden(AppException):
    def __init__(self, detail: str = "You can't do that here") -> None:
        super().__init__(detail, 403)


class EventsConflict(AppException):
    def __init__(self, detail: str) -> None:
        super().__init__(detail, 409)


class EventsPaymentUnavailable(AppException):
    """Online card payment is configured but could not start (503, retryable).

    The order's hold is released, so the buyer can simply try again."""

    def __init__(self) -> None:
        super().__init__(
            "Online payment is temporarily unavailable. Please try again shortly.",
            503,
        )
