from src.exceptions import AppException


class RevisionConflict(AppException):
    def __init__(self, message: str = "This product changed. Reload it before saving."):
        super().__init__(message, 409)


class ProductValidationError(AppException):
    def __init__(self, errors: list[str]):
        super().__init__("\n".join(errors), 422)


class WeatherUnavailable(AppException):
    def __init__(self) -> None:
        super().__init__("Weather products are unavailable. Try again.", 503)
