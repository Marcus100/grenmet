"""Documented error responses shared by the janitorial routers."""

from typing import Any

from fastapi import status

from src.models import ApiError

Responses = dict[int | str, dict[str, Any]]

FORBIDDEN: Responses = {
    status.HTTP_403_FORBIDDEN: {
        "model": ApiError,
        "description": "Insufficient permission or building out of scope",
    }
}
NOT_FOUND: Responses = {
    status.HTTP_404_NOT_FOUND: {"model": ApiError, "description": "Not found"}
}
CONFLICT: Responses = {
    status.HTTP_409_CONFLICT: {
        "model": ApiError,
        "description": "Stale revision or duplicate record",
    }
}
INVALID: Responses = {
    status.HTTP_422_UNPROCESSABLE_CONTENT: {
        "model": ApiError,
        "description": "Invalid janitorial data",
    }
}
UNAVAILABLE: Responses = {
    status.HTTP_503_SERVICE_UNAVAILABLE: {
        "model": ApiError,
        "description": "Janitorial database unavailable",
    }
}
WRITE: Responses = {**FORBIDDEN, **NOT_FOUND, **CONFLICT, **INVALID, **UNAVAILABLE}
