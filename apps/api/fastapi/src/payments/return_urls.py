"""Where Stripe Checkout sends the buyer afterwards, per purchase type.

A consuming domain registers a builder for its ``source_type`` (like
``service.PAID_TOPICS``, payments imports no consumer: the consumer calls
``register`` when its module loads). The builder gets only the intent's own
``source_id`` and the addresses come from app URL settings, never from a request,
so there is no open redirect. A source type with no builder, or a builder that
returns nothing usable, falls back to the global ``PAYMENTS_STRIPE_SUCCESS_URL``
and ``PAYMENTS_STRIPE_CANCEL_URL``; both are held to the same acceptability check.
"""

from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urlsplit

from src.config import settings

from .config import PaymentsConfig


@dataclass(frozen=True)
class ReturnAddress:
    success_url: str
    cancel_url: str


Builder = Callable[[str | None], ReturnAddress | None]

_builders: dict[str, Builder] = {}

_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1"})


def register(source_type: str, builder: Builder) -> None:
    _builders[source_type] = builder


def _acceptable(url: str) -> bool:
    """HTTPS everywhere; ``http://localhost`` only when ``ENVIRONMENT`` is local.

    In staging and production a localhost address (whatever the scheme) is
    refused, so a default dev URL cannot reach a real buyer."""
    parts = urlsplit(url)
    if not parts.netloc:
        return False
    if settings.ENVIRONMENT != "local":
        return parts.scheme == "https" and parts.hostname not in _LOCAL_HOSTS
    return parts.scheme == "https" or (
        parts.scheme == "http" and parts.hostname in _LOCAL_HOSTS
    )


def resolve(
    source_type: str, source_id: str | None, config: PaymentsConfig
) -> ReturnAddress | None:
    """The registered address for the purchase, else the global one, else None."""
    builder = _builders.get(source_type)
    if builder is not None:
        address = builder(source_id)
        if (
            address is not None
            and _acceptable(address.success_url)
            and _acceptable(address.cancel_url)
        ):
            return address
    fallback = ReturnAddress(
        config.STRIPE_SUCCESS_URL or "", config.STRIPE_CANCEL_URL or ""
    )
    if _acceptable(fallback.success_url) and _acceptable(fallback.cancel_url):
        return fallback
    return None
