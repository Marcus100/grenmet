"""
Global exception handlers and custom exceptions.
"""

from fastapi import Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.exc import IntegrityError


class AppException(Exception):
    """Base application exception."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class NotFoundError(AppException):
    """Resource not found exception."""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class AppValidationError(AppException):
    """Application validation error exception."""

    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY)


class AuthenticationError(AppException):
    """Authentication error exception."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class AuthorizationError(AppException):
    """Authorization error exception."""

    def __init__(self, message: str = "Access denied"):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


async def app_exception_handler(
    request: Request,  # noqa: ARG001
    exc: AppException,
) -> JSONResponse:
    """Handle application exceptions."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


async def validation_exception_handler(
    request: Request,  # noqa: ARG001
    exc: PydanticValidationError,
) -> JSONResponse:
    """Handle Pydantic validation errors."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "errors": jsonable_encoder(exc.errors()),
        },
    )


async def integrity_error_handler(
    request: Request,  # noqa: ARG001
    exc: IntegrityError,  # noqa: ARG001
) -> JSONResponse:
    """Handle database integrity errors."""
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "Resource already exists or constraint violation"},
    )
