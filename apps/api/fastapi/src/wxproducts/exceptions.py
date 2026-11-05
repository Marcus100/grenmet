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


class TropicalSystemConflict(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, 409)


class UnsupportedSheetKind(AppException):
    """A PDF sheet was requested for a product kind that has no layout."""

    def __init__(self, kind: str) -> None:
        super().__init__(f"No PDF layout exists for product kind '{kind}'", 422)
