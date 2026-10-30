"""Where Stripe Checkout sends the buyer afterwards, per purchase type.

A consuming domain registers a builder for its ``source_type`` (like
``service.PAID_TOPICS``, payments imports no consumer: the consumer calls
``register`` when its module loads). The builder gets only the intent's own
``source_id`` and the addresses come from app URL settings, never from a request,
so there is no open redirect. A source type with no builder, or a builder that
returns nothing usable, falls back to the global ``PAYMENTS_STRIPE_SUCCESS_URL``
and ``PAYMENTS_STRIPE_CANCEL_URL``; both are held to the same acceptability check.
"""

import ipaddress
import re
import socket
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

#: Numeric host spellings ``inet_aton`` reads (``2130706433``, ``127.1``, ``0x7f.1``).
_LEGACY_IPV4 = re.compile(r"[0-9a-fA-FxX.]+")


def _as_ip(name: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """The address a host names, or None when it is a name. Legacy IPv4 forms are
    read the way the resolver reads them; this never resolves a name over the network."""
    try:
        return ipaddress.ip_address(name)
    except ValueError:
        pass
    if _LEGACY_IPV4.fullmatch(name) is None:
        return None
    try:
        return ipaddress.IPv4Address(socket.inet_aton(name))
    except OSError, ValueError:
        return None


def _is_local_host(hostname: str | None) -> bool:
    """True when the host is, or may resolve to, this machine or a private network:
    localhost names, loopback, unspecified, private and link-local addresses (an
    IPv4-mapped IPv6 address is judged by its IPv4 address). A missing host is not
    acceptable either."""
    if not hostname:
        return True
    name = hostname.rstrip(".").lower()
    if not name or name == "localhost" or name.endswith(".localhost"):
        return True
    ip = _as_ip(name)
    if ip is None:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_loopback or ip.is_unspecified or ip.is_private or ip.is_link_local


def register(source_type: str, builder: Builder) -> None:
    _builders[source_type] = builder


def _acceptable(url: str) -> bool:
    """HTTPS everywhere; ``http://localhost`` only when ``ENVIRONMENT`` is local.

    In staging and production a localhost address (whatever the scheme) is
    refused, so a default dev URL cannot reach a real buyer."""
    parts = urlsplit(url)
    if not parts.netloc:
        return False
    local = _is_local_host(parts.hostname)
    if settings.ENVIRONMENT != "local":
        return parts.scheme == "https" and not local
    return parts.scheme == "https" or (parts.scheme == "http" and local)


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
