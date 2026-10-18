from fastapi import status

from src.exceptions import AppException


class ProgramNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Rewards programme not found", status.HTTP_404_NOT_FOUND)


class RedemptionNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Redemption not found", status.HTTP_404_NOT_FOUND)


class RewardsConflictError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class RewardsValidationError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY)
