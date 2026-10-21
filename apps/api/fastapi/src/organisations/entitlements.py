"""What an organisation can be entitled to: registered apps plus platform products.

``org.organisation_app`` rows name one of these keys. Registered apps come from
``src/auth/apps.py`` (they have their own sign-in); products are platform APIs
that organisations use from their own sites and have no sign-in of their own.
``require_org_app`` (``dependencies.py``) enforces an entitlement per request.
"""

from dataclasses import dataclass

from src.auth import apps as auth_apps

#: Platform products an organisation may be entitled to (key -> label).
PRODUCTS: dict[str, str] = {
    "bookings": "Barrels Bookings",
    "rewards": "Barrels Rewards",
    "contacts": "Barrels Contacts",
    "payments": "Barrels Payments",
    "webhooks": "Barrels Webhooks",
}


@dataclass(frozen=True)
class EntitlementOption:
    key: str
    label: str


def options() -> list[EntitlementOption]:
    """Every entitlement key, registered apps first, in display order."""
    apps = [EntitlementOption(app.key, app.label) for app in auth_apps.all_apps()]
    products = [EntitlementOption(key, label) for key, label in PRODUCTS.items()]
    return [*apps, *products]


def is_known(key: str) -> bool:
    return key in PRODUCTS or auth_apps.is_registered(key)


#: Entitlements granted together with another (ADR-0028): an organisation that takes
#: bookings holds the people it books, so it gets the contact book (view, merge,
#: erase). Switching `bookings` off later leaves `contacts` alone; `contacts` is
#: still sold on its own.
BUNDLED_WITH: dict[str, tuple[str, ...]] = {"bookings": ("contacts",)}
