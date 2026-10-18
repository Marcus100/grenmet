"""Stores domain exceptions (handled by the global ``AppException`` handler)."""

from src.exceptions import AppException, AuthorizationError, NotFoundError


class StoresNotFoundError(NotFoundError):
    def __init__(self, what: str = "Record") -> None:
        super().__init__(f"{what} not found")


class StoresPermissionError(AuthorizationError):
    def __init__(self, message: str = "Not permitted for this requisition") -> None:
        super().__init__(message)


class StoresStateError(AppException):
    """The record's current state does not allow the action."""

    def __init__(self, message: str) -> None:
        super().__init__(message, 409)


class InsufficientStockError(AppException):
    def __init__(self, item_name: str, available: int, needed: int) -> None:
        super().__init__(
            f"Insufficient stock for {item_name}: {available} on hand, {needed} needed",
            409,
        )


class StoresValidationError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, 422)
