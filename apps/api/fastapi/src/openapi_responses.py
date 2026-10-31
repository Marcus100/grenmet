"""Reusable OpenAPI error-response declarations for route decorators.

Spread them into a route's ``responses=`` so the contract (and the generated
client) documents the errors the route can actually return, e.g.
``responses={**AUTHENTICATED, **NOT_FOUND}``. tests/test_openapi_contract.py
requires a documented 4xx on every authenticated or path-addressed operation,
a body schema on every documented 4xx except 422, and a JSON error model only
under application/json.

Runtime bodies (verified in tests/test_error_response_bodies.py): application
and HTTP errors are ``{"detail": "<string>"}`` (ApiError). The rate limiter's
429 is ``{"error": "<string>"}`` (ErrorMessage), and a 429 from an application
lockout is ``{"detail": ...}``, so a 429 documents either shape.

HTML routes (response_class=HTMLResponse) use ``html_error`` or ``as_json``
instead, because FastAPI files a ``model`` under the route's own media type.
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


def as_json(responses: ResponseMap) -> ResponseMap:
    """Re-declare JSON error responses on an HTML route, naming application/json.

    The ``model`` is dropped, so FastAPI does not file it under text/html.
    """
    return {
        status: {
            "description": response["description"],
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/ApiError"}
                }
            },
        }
        for status, response in responses.items()
    }


def html_error(description: str) -> ResponseMap:
    """A 4xx whose body is an HTML page (not JSON), so no JSON error model applies."""
    return {
        400: {
            "description": description,
            "content": {"text/html": {"schema": {"type": "string"}}},
        }
    }
