"""The scope vocabulary of organisation API keys (ADR-0029, PF5).

A scope is ``<product>.<read|write>`` for a platform product in
``entitlements.PRODUCTS``. Scopes are product-level on purpose: they say which
product API a key may call, while the organisation's entitlement and the key's
creator role bound what it can ever hold.
"""

from src.organisations import entitlements

ACCESS_LEVELS: tuple[str, ...] = ("read", "write")


def all_scopes() -> list[str]:
    """Every grantable scope, in product then access order."""
    return [
        f"{product}.{level}"
        for product in entitlements.PRODUCTS
        for level in ACCESS_LEVELS
    ]


def is_valid(scope: str) -> bool:
    return scope in all_scopes()


def product_of(scope: str) -> str:
    """The entitlement key a scope belongs to (``bookings.read`` -> ``bookings``)."""
    return scope.partition(".")[0]
