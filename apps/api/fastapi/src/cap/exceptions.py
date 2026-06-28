from src.exceptions import AppException, NotFoundError


class CapAlertNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("CAP alert not found")


class CapSnapshotNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("CAP XML not found")


class CapStateError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, 409)


class CapValidationFailedError(AppException):
    def __init__(self, errors: list[str]) -> None:
        super().__init__(f"Validation failed: {'; '.join(errors)}", 422)


class CapImportError(AppException):
    """Raised when external CAP XML cannot be parsed/imported (400)."""

    def __init__(self, message: str) -> None:
        super().__init__(f"CAP import failed: {message}", 400)


class CapFeedNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("CAP feed not found")
