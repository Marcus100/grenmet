"""Reusable OpenAPI error-response declarations for route decorators.

Spread them into a route's ``responses=`` so the contract (and the generated
client) documents the errors the route can actually return, e.g.
``responses={**AUTHENTICATED, **NOT_FOUND}``. tests/test_openapi_contract.py
requires a documented 4xx on every authenticated or path-addressed operation,
and a body schema on every documented 4xx except 422.

Runtime bodies (verified in tests/test_error_response_bodies.py): application
and HTTP errors are ``{"detail": "<string>"}`` (ApiError). The rate limiter's
429 is ``{"error": "<string>"}`` (ErrorMessage), and a 429 from an application
lockout is ``{"detail": ...}``, so a 429 documents either shape.
"""

from typing import Any

from src.models import ApiError, ErrorMessage

type ResponseMap = dict[int | str, dict[str, Any]]

#: A 429 is either the rate limiter's ``{"error"}`` or an application lockout's
#: ``{"detail"}``. Documented as the union so neither shape is claimed away.
RateLimitedBody = ApiError | ErrorMessage

UNAUTHENTICATED: ResponseMap = {
    401: {"model": ApiError, "description": "Missing or invalid credentials"},
}
AUTHENTICATED: ResponseMap = {
    **UNAUTHENTICATED,
    403: {
        "model": ApiError,
        "description": "Account not permitted: inactive, not yet approved, "
        "or lacking the required permission",
    },
}
NOT_FOUND: ResponseMap = {404: {"model": ApiError, "description": "Resource not found"}}
CONFLICT: ResponseMap = {
    409: {"model": ApiError, "description": "Request conflicts with current state"},
}
BAD_REQUEST: ResponseMap = {
    400: {"model": ApiError, "description": "Malformed request"}
}
RATE_LIMITED: ResponseMap = {
    429: {"model": RateLimitedBody, "description": "Rate limit exceeded"},
}
