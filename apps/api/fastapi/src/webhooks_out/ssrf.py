"""SSRF guard for webhook URLs.

A receiver must be a public https host. The guard runs at registration and again
at delivery on the addresses actually resolved then, and delivery connects to the
address it validated (see ``delivery.py``), so a DNS answer that changes between
check and connect cannot reach an internal network.
"""

import asyncio
import ipaddress
import socket
from urllib.parse import SplitResult, urlsplit

MAX_URL_LENGTH = 2048
_BLOCKED_NAMES = {"localhost", "localhost.localdomain"}


class UnsafeTargetError(Exception):
    """The URL or the addresses it resolves to are not allowed."""


def parse_url(url: str) -> SplitResult:
    """Shape checks that need no network: https, a host, no credentials."""
    if len(url) > MAX_URL_LENGTH:
        raise UnsafeTargetError("The URL is too long")
    try:
        parts = urlsplit(url.strip())
        port = parts.port
    except ValueError:
        raise UnsafeTargetError("The URL is not valid") from None
    if parts.scheme != "https":
        raise UnsafeTargetError("Only https URLs are allowed")
    host = parts.hostname
    if not host:
        raise UnsafeTargetError("The URL needs a host")
    if parts.username is not None or parts.password is not None:
        raise UnsafeTargetError("The URL must not contain credentials")
    if parts.fragment:
        raise UnsafeTargetError("The URL must not contain a fragment")
    lowered = host.lower().rstrip(".")
    if lowered in _BLOCKED_NAMES or lowered.endswith(".localhost"):
        raise UnsafeTargetError("The host is not a public address")
    if port == 0:
        raise UnsafeTargetError("The URL is not valid")
    return parts


def is_public_ip(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        elif ip.sixtofour is not None and not ip.sixtofour.is_global:
            return False
    return ip.is_global and not ip.is_multicast


async def resolve_host(host: str) -> list[str]:
    """Resolve without blocking the event loop. Tests replace this function."""
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError:
        return []
    return list(dict.fromkeys(str(info[4][0]) for info in infos))


async def public_addresses(host: str) -> list[str]:
    """Every address ``host`` resolves to, all of which must be public."""
    addresses = await resolve_host(host)
    if not addresses:
        raise UnsafeTargetError("The host does not resolve")
    if not all(is_public_ip(address) for address in addresses):
        raise UnsafeTargetError("The host resolves to a non-public address")
    return addresses


async def check_url(url: str) -> tuple[SplitResult, list[str]]:
    parts = parse_url(url)
    assert parts.hostname is not None
    return parts, await public_addresses(parts.hostname)
