"""The scope vocabulary of organisation API keys (ADR-0029, PF5).

A scope is ``<product>.<read|write>`` for a platform product in
``entitlements.PRODUCTS``, and it is a permission key defined in
``src/auth/permissions.py`` (one list). A pair missing from that catalogue is
not grantable. Scopes are product-level on purpose: they say which
product API a key may call, while the organisation's entitlement and the key's
creator role bound what it can ever hold.
"""

from src.auth.permissions import ALL_PERMISSION_KEYS
from src.organisations import entitlements

ACCESS_LEVELS: tuple[str, ...] = ("read", "write")


def all_scopes() -> list[str]:
    """Every grantable scope, in product then access order."""
    return [
        scope
        for product in entitlements.PRODUCTS
        for level in ACCESS_LEVELS
        if (scope := f"{product}.{level}") in ALL_PERMISSION_KEYS
    ]


def is_valid(scope: str) -> bool:
    return scope in all_scopes()


def product_of(scope: str) -> str:
    """The entitlement key a scope belongs to (``bookings.read`` -> ``bookings``)."""
    return scope.partition(".")[0]
