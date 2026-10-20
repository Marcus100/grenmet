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


class VenueNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Venue not found", status.HTTP_404_NOT_FOUND)


class TrailNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Trail not found", status.HTTP_404_NOT_FOUND)


class InvalidCheckInCodeError(AppException):
    """One message for unknown venue, tampered, expired or inactive: no oracle."""

    def __init__(self) -> None:
        super().__init__(
            "This check-in code is not valid or has expired",
            status.HTTP_400_BAD_REQUEST,
        )


class LeaderboardScopeNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Leaderboard not found", status.HTTP_404_NOT_FOUND)


class ChallengeNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Challenge not found", status.HTTP_404_NOT_FOUND)


class GiftNotFoundError(AppException):
    def __init__(self, message: str = "Gift not found") -> None:
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class RewardsValidationError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY)
