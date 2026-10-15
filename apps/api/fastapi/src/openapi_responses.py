"""Reusable OpenAPI error-response declarations for route decorators.

Spread them into a route's ``responses=`` so the contract (and the generated
client) documents the errors the route can actually return, e.g.
``responses={**AUTHENTICATED, **NOT_FOUND}``. tests/test_openapi_contract.py
requires a documented 4xx on every authenticated or path-addressed operation.
"""

from typing import Any

type ResponseMap = dict[int | str, dict[str, Any]]

UNAUTHENTICATED: ResponseMap = {401: {"description": "Missing or invalid credentials"}}
AUTHENTICATED: ResponseMap = {
    **UNAUTHENTICATED,
    403: {
        "description": "Account not permitted: inactive, not yet approved, "
        "or lacking the required permission"
    },
}
NOT_FOUND: ResponseMap = {404: {"description": "Resource not found"}}
CONFLICT: ResponseMap = {409: {"description": "Request conflicts with current state"}}
BAD_REQUEST: ResponseMap = {400: {"description": "Malformed request"}}
