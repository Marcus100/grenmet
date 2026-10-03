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
