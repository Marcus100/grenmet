"""Product-owned role bundles for organisation membership grants (ADR-0044).

A bundle maps a ``role_key`` (stored in ``org.membership_grant``) to
organisation-bound permission keys from ``src/auth/permissions.py``. Keys stay
central and owner-reviewed; the bundles below are the product's to edit. A
registry test requires every key to exist with ``binding="organisation"``.

``owner`` and ``admin`` need no grant: they hold every organisation key of every
entitled product (``grants.effective_keys``). Add Bookings bundles in ADR-0044
slice S4.
"""

from types import MappingProxyType

ROLE_BUNDLES: MappingProxyType[str, frozenset[str]] = MappingProxyType(
    {
        # Events (ADR-0044 decision 3). Refunds and team management are separate
        # roles so a manager can see settlement without issuing refunds.
        "events-door": frozenset({"events.door.scan"}),
        "events-till": frozenset({"events.tickets.sell"}),
        "events-manager": frozenset(
            {
                "events.listings.manage",
                "events.door.scan",
                "events.tickets.sell",
                "events.settlement.view",
            }
        ),
        "events-refunds": frozenset({"events.refunds.issue"}),
        "events-team": frozenset({"events.team.manage"}),
    }
)


def bundle_keys(role_key: str) -> frozenset[str] | None:
    """The keys a role bundle holds, or ``None`` for an unknown ``role_key``."""
    return ROLE_BUNDLES.get(role_key)


def product_of_key(permission_key: str) -> str:
    """The entitlement key of an organisation key (``events.door.scan`` -> ``events``)."""
    return permission_key.partition(".")[0]
