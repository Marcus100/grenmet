"""
Global exception handlers and custom exceptions.
"""

import logging
from collections.abc import Iterable, Mapping
from typing import Any, cast

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from src.models import ApiError, ValidationErrorItem, ValidationErrorResponse

logger = logging.getLogger(__name__)


class AppException(Exception):
    """Base application exception."""

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        headers: dict[str, str] | None = None,
    ):
        self.message = message
        self.status_code = status_code
        #: Protocol headers sent with the error (for example ``WWW-Authenticate``
        #: on a 401, ``Retry-After`` on a 429); None for ordinary errors.
        self.headers = headers
        #: Extra documented fields merged into the error body next to ``detail``
        #: (for example roster rule warnings); empty for ordinary errors.
        self.extra: dict[str, object] = {}
        super().__init__(self.message)


class NotFoundError(AppException):
    """Resource not found exception."""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class AppValidationError(AppException):
    """Application validation error exception."""

    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_CONTENT)


class AuthenticationError(AppException):
    """Authentication error exception."""

    def __init__(
        self,
        message: str = "Authentication failed",
        headers: dict[str, str] | None = None,
    ):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED, headers=headers)


class AuthorizationError(AppException):
    """Authorization error exception."""

    def __init__(self, message: str = "Access denied"):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


async def app_exception_handler(
    request: Request,  # noqa: ARG001
    exc: AppException,
) -> JSONResponse:
    """Handle application exceptions."""
    # Extra fields never replace the stable ``detail``.
    content: dict[str, object] = {
        **exc.extra,
        **ApiError(detail=exc.message).model_dump(),
    }
    return JSONResponse(
        status_code=exc.status_code, content=content, headers=exc.headers
    )


def _validation_response(errors: Iterable[Mapping[str, Any]]) -> JSONResponse:
    """Answer 422 with the documented ``ValidationErrorResponse`` envelope.

    Only ``type``, ``loc`` and ``msg`` are copied. FastAPI's ``input`` (the
    submitted value) and ``ctx`` fields are never returned, so sign-in setup
    reasons are not sent back as fields. A ``msg`` can still quote a fragment
    of the value, as pydantic writes it.
    """
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content=ValidationErrorResponse(
            errors=[
                ValidationErrorItem(
                    type=str(error.get("type", "value_error")),
                    loc=[
                        str(part) if not isinstance(part, int) else part
                        for part in error.get("loc", ())
                    ],
                    msg=str(error.get("msg", "Validation error")),
                )
                for error in errors
            ]
        ).model_dump(),
    )


async def request_validation_exception_handler(
    _request: Request,
    exc: Exception,
) -> JSONResponse:
    """Handle malformed requests (FastAPI's own 422) in the documented shape.

    Registered only for ``RequestValidationError``, so the narrowing is safe.
    Typed as ``Exception`` to match Starlette's handler signature.
    """
    return _validation_response(cast(RequestValidationError, exc).errors())


UNIQUE_VIOLATION_SQLSTATE = "23505"


def _integrity_details(exc: IntegrityError) -> tuple[str | None, str | None]:
    """Return ``(sqlstate, constraint_name)`` from the driver error, if present."""
    orig = exc.orig
    sqlstate = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    diag = getattr(orig, "diag", None)
    constraint = getattr(diag, "constraint_name", None)
    return (
        sqlstate if isinstance(sqlstate, str) else None,
        constraint if isinstance(constraint, str) else None,
    )


async def integrity_error_handler(
    request: Request,  # noqa: ARG001
    exc: IntegrityError,
) -> JSONResponse:
    """Answer 409 for an unique violation nobody mapped; re-raise the rest.

    Code that expects a conflict catches ``IntegrityError`` and raises a typed
    ``AppException``. A NOT NULL, foreign key or check failure reaching here is
    a server bug, so it is re-raised: the unhandled-exception handler answers
    500 and Sentry records it.
    """
    sqlstate, constraint = _integrity_details(exc)
    if sqlstate != UNIQUE_VIOLATION_SQLSTATE:
        raise exc
    logger.warning(
        "Unmapped unique violation answered as 409 constraint=%s",
        constraint,
        extra={"error_type": type(exc).__name__},
    )
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "Resource already exists or constraint violation"},
    )
