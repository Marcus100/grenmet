from fastapi import status

from src.exceptions import AppException


class ProbeRateLimitedError(AppException):
    """Too many probe calls from one address (429). Credentials are not checked first."""

    def __init__(self) -> None:
        super().__init__(
            "Too many requests",
            status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": "60"},
        )
