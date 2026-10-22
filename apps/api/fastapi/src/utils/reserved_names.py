"""Platform-wide reserved names (ADR-0043).

A reserved name cannot be claimed as an organisation slug, a booking
``public_slug`` or a host label by anyone except the platform. A tenant slug is a
path under a product host (``bookings.barrels.gd/<slug>``), so it must not shadow
a real route or a host label.

``docs/ports.md`` ("Reserved names") is the human-readable list.
``tests/test_reserved_names.py`` fails if this set and that section drift apart,
or if a top-level route folder of a tenant-path web app is missing here. Edit
both together.

Only slugs created or changed after this list shipped are validated; an existing
slug that now collides stays readable.
"""

RESERVED_NAMES: frozenset[str] = frozenset(
    {
        # Identity and access
        "app",
        "apps",
        "account",
        "accounts",
        "id",
        "login",
        "signin",
        "signout",
        "signup",
        "sso",
        "oauth",
        "auth",
        "admin",
        "root",
        "superuser",
        "staff",
        "internal",
        # Environments
        "staging",
        "stg",
        "dev",
        "test",
        "preview",
        "sandbox",
        "demo",
        "beta",
        # Ops
        "ops",
        "status",
        "health",
        "metrics",
        "monitor",
        "grafana",
        "traefik",
        "adminer",
        "db",
        "redis",
        # Mail
        "mail",
        "smtp",
        "imap",
        "mx",
        "autodiscover",
        "autoconfig",
        "send",
        "bounce",
        "email",
        "notify",
        "news",
        # Files and static
        "cdn",
        "static",
        "assets",
        "media",
        "files",
        "uploads",
        "images",
        "storage",
        "s3",
        # Help and legal
        "help",
        "support",
        "legal",
        "privacy",
        "terms",
        "security",
        "abuse",
        "postmaster",
        "hostmaster",
        "webmaster",
        # Money
        "billing",
        "pay",
        "payments",
        "checkout",
        "invoices",
        # Machine endpoints
        "webhooks",
        "hooks",
        "callback",
        "ws",
        "mcp",
        "ai",
        "api",
        "developers",
        # Product and client hosts
        "bookings",
        "events",
        "hr",
        "shop",
        "signal",
        "elections",
        "gmsdash",
        "cap",
        "weather",
        "docs",
        "cms",
        "mbia",
        "babydoll",
        "gms",
        # Reserved sector products (not built)
        "education",
        "automotive",
        "delivery",
        "bus",
        "park",
        "taxi",
        "homegrown",
        "shopkeeping",
        # Retired hosts
        "gmsadmin",
        "gaa-admin",
        "wxwatch",
        "wxproducts",
        "salesbus",
        "sales",
        "hurricane",
        "spice",
        "proxy",
        "grenmet",
        # Brand and generic words
        "www",
        "barrels",
        "gaa",
        "passport",
        "rewards",
        "contacts",
        "business",
        "tickets",
        "studio",
        "org",
        "me",
        "public",
        "embed",
        "widget",
        "manage",
        "booking",
        "settings",
        "new",
        "search",
        "about",
    }
)


def is_reserved(name: str) -> bool:
    """Whether ``name`` (any case, surrounding space ignored) is reserved."""
    return name.strip().lower() in RESERVED_NAMES
