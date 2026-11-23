"""Commerce constants: the entitlement key, permission keys and money rules."""

from enum import Enum

#: Entitlement row key (``org.organisation_app.app_key``). Not in
#: ``entitlements.PRODUCTS`` yet: that would also make ``commerce.read`` and
#: ``commerce.write`` API-key scopes (ADR-0029). See ``AGENTS.md``.
APP_KEY = "commerce"

SELL_KEY = "commerce.sell"
CATALOGUE_MANAGE_KEY = "commerce.catalogue.manage"

#: Money is an integer count of minor units (cents). The ceiling is 100 million
#: XCD, far above any single price, and keeps the value inside a BIGINT check.
MAX_AMOUNT_MINOR = 10_000_000_000

PRODUCT_NAME_MAX_LENGTH = 120


class Currency(str, Enum):
    """ISO codes the commerce money columns accept. XCD first (ADR-0063, section 3)."""

    XCD = "XCD"


class BaseUnit(str, Enum):
    """The unit a product is counted in. Quantities arrive with the stock slice."""

    EACH = "each"
    KILOGRAM = "kg"
    GRAM = "g"
    LITRE = "l"
    MILLILITRE = "ml"
