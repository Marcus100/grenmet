"""
Rate limiting for auth and sensitive endpoints.

- Login, password-recovery, and reset-password are rate limited (e.g. 5–10/minute per IP).
- Returns 429 Too Many Requests when the limit is exceeded.
- Uses Redis (REDIS_URL) with short timeouts; checks run off the event loop, and a Redis failure falls back to per-process limits (fail open).
"""

import asyncio
import functools
import hmac
import inspect
import ipaddress
import logging
import time
from collections.abc import Callable
from typing import Any, cast

from fastapi import Request
from limits.storage import MemoryStorage
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import _should_exempt
from slowapi.util import get_remote_address
from starlette.routing import Match
from starlette.types import ASGIApp, Receive, Scope, Send

from src.config import settings
from src.worker.config import worker_settings

VISITOR_IP_HEADER = "X-Visitor-IP"
VISITOR_SECRET_HEADER = "X-Visitor-Secret"
MIN_TRUSTED_SECRET_LENGTH = 32

logger = logging.getLogger(__name__)


def warn_if_secret_too_short() -> bool:
    """Log (never the value) when TRUSTED_WEB_SECRET is set but too short to use."""
    short = 0 < len(settings.TRUSTED_WEB_SECRET) < MIN_TRUSTED_SECRET_LENGTH
    if short:
        logger.warning(
            "TRUSTED_WEB_SECRET is shorter than 32 characters and is ignored; "
            "rate limits key on the connecting address"
        )
    return short


warn_if_secret_too_short()


def _trusted_secret() -> bytes | None:
    secret = settings.TRUSTED_WEB_SECRET
    if len(secret) < MIN_TRUSTED_SECRET_LENGTH:
        return None
    return secret.encode("utf-8")


def _parse_visitor_ip(
    claimed: str,
) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """The claimed address as an IP (IPv4-mapped IPv6 unwrapped), or None.

    Scope IDs are rejected."""
    text = claimed.strip()
    if "%" in text:
        return None
    try:
        ip = ipaddress.ip_address(text)
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return ip.ipv4_mapped
    return ip


def _is_auth_path(request: Request) -> bool:
    prefix = f"{settings.API_V1_STR}/auth"
    path = request.url.path
    return path == prefix or path.startswith(prefix + "/")


def _trusted_visitor_ip(
    request: Request,
    *,
    allow_auth: bool = False,
) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    secret = _trusted_secret()
    presented = request.headers.get(VISITOR_SECRET_HEADER)
    claimed = request.headers.get(VISITOR_IP_HEADER)
    if not (secret and presented and claimed):
        return None
    if _is_auth_path(request) and not allow_auth:
        return None
    try:
        matches = hmac.compare_digest(presented.encode("utf-8"), secret)
    except UnicodeEncodeError, TypeError:
        return None
    return _parse_visitor_ip(claimed) if matches else None


def connecting_ip(request: Request) -> str:
    """The address of whoever connected through the edge proxies, unmasked.

    For records that store one address (sign-in sessions) and services that
    need one (Turnstile); rate limits use ``connecting_address``.

    uvicorn (``--proxy-headers``, trusting the compose network) already resolves
    the right-most ``X-Forwarded-For`` entry: the peer Traefik saw. Behind
    Cloudflare's proxy that peer is a Cloudflare edge, so with
    ``VISITOR_IP_PROXY_HOPS`` = 2 the visitor is the entry Cloudflare appended,
    one further left. Entries further left are visitor-controlled and never
    read. A missing or malformed entry falls back to uvicorn's address, as do
    server-side calls from the web hosts (they send no ``X-Forwarded-For``).
    """
    fallback = get_remote_address(request)
    hops = settings.VISITOR_IP_PROXY_HOPS
    if hops <= 1:
        return fallback
    forwarded = ",".join(request.headers.getlist("x-forwarded-for"))
    entries = [entry.strip() for entry in forwarded.split(",")] if forwarded else []
    if len(entries) < hops:
        return fallback
    ip = _parse_visitor_ip(entries[-hops])
    return str(ip) if ip is not None else fallback


def _bucket(address: str) -> str:
    """IPv6 addresses share one bucket per /64 (one subscriber can rotate
    through it); IPv4 and non-IP values (test clients) are returned as is."""
    ip = _parse_visitor_ip(address)
    if isinstance(ip, ipaddress.IPv6Address):
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip) if ip is not None else address


def connecting_address(request: Request) -> str:
    """The rate-limit key for the connecting address: ``connecting_ip``, with
    IPv6 grouped per /64 as on the trusted web-host path."""
    return _bucket(connecting_ip(request))


def request_ip(request: Request) -> str | None:
    """The address to record on a sign-in session, or None without a client.

    Behind Cloudflare's proxy ``request.client`` is a Cloudflare edge; this is
    the visitor (``connecting_ip``, unmasked)."""
    return connecting_ip(request) if request.client else None


def visitor_ip(request: Request) -> str:
    """The real client address, unmasked: for services that need an IP (Turnstile).

    The validated ``X-Visitor-IP`` from a trusted web host, else the connecting
    address."""
    ip = _trusted_visitor_ip(request)
    return str(ip) if ip is not None else connecting_ip(request)


def visitor_address(request: Request) -> str:
    """The address to rate-limit on.

    Next.js hosts call this API server-side, so the connecting address is the
    host's, shared by every visitor. A host that presents the shared
    ``TRUSTED_WEB_SECRET`` may name the real visitor in ``X-Visitor-IP``. Without
    the secret (unset, shorter than 32 characters, missing or wrong), with an
    unusable address, or on ``/auth`` routes (sign-in and OTP limits must not be
    choosable by a secret holder) the header is ignored and the connecting
    address is used. Any malformed header fails open to the connecting address.
    IPv6 visitors share a bucket per /64 (one subscriber can rotate through it).
    """
    ip = _trusted_visitor_ip(request)
    if ip is None:
        return connecting_address(request)
    return _bucket(str(ip))


# Bound every Redis round trip: a hung Redis must not stall a request (#1419 does
# the same for the other request-path clients).
REDIS_TIMEOUT_SECONDS = 0.25


class AsyncSafeLimiter(Limiter):
    """slowapi limiter that never blocks the event loop.

    slowapi checks the limit synchronously inside ``async def`` routes, and the
    ``limits`` Redis client is synchronous. For coroutine routes the check runs in
    a worker thread first; slowapi's own check is then skipped. A Redis failure
    falls back to per-process limits (``in_memory_fallback_enabled``) and, if even
    that fails, the request is allowed (``swallow_errors``): fail open, like
    ``src/auth/lockout.py``.
    """

    def limit(
        self, *args: Any, scope: str | None = None, **kwargs: Any
    ) -> Callable[..., Any]:
        """``@limiter.limit(...)`` plus an optional fixed ``scope``.

        slowapi keys a route's limit by its request path unless a scope is set. A
        path that carries a secret (a feed token) would then be stored in Redis, so
        such a route names a scope that holds no path."""
        decorate = super().limit(*args, **kwargs)

        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            decorated: Callable[..., Any] = decorate(func)
            if scope is not None:
                registered = self._route_limits.get(
                    f"{func.__module__}.{func.__name__}", []
                )
                # slowapi exposes ``scope`` read-only and keeps it name-mangled. The
                # key test (tests/bookings/test_calendar_feed.py) fails if this stops
                # taking effect after a slowapi upgrade.
                for item in registered[-1:]:
                    setattr(item, "_Limit__scope", scope)  # noqa: B010
            if not inspect.iscoroutinefunction(func):
                return decorated
            positional = list(inspect.signature(func).parameters).index("request")

            @functools.wraps(func)
            async def wrapper(*a: Any, **kw: Any) -> Any:
                request = kw.get(
                    "request", a[positional] if len(a) > positional else None
                )
                if (
                    self.enabled
                    and isinstance(request, Request)
                    and not getattr(request.state, "_rate_limiting_complete", False)
                ):
                    await asyncio.to_thread(
                        self._check_request_limit, request, func, False
                    )
                    request.state._rate_limiting_complete = True
                return await decorated(*a, **kw)

            return wrapper

        return decorator


# Use a shared Redis store when REDIS_URL is configured (required for correct
# rate limiting across multiple app instances); otherwise fall back to in-memory.
limiter = AsyncSafeLimiter(
    key_func=visitor_address,
    storage_uri=worker_settings.REDIS_URL,
    # slowapi types the options as str, but redis-py needs numbers
    storage_options=cast(
        "dict[str, str]",
        {
            "socket_timeout": REDIS_TIMEOUT_SECONDS,
            "socket_connect_timeout": REDIS_TIMEOUT_SECONDS,
        },
    ),
    in_memory_fallback_enabled=True,
    swallow_errors=True,
    # One shared budget per client address across every route without its own limit.
    application_limits=(
        [f"{settings.DEFAULT_RATE_LIMIT_PER_MINUTE}/minute"]
        if settings.DEFAULT_RATE_LIMIT_MODE != "off"
        and settings.DEFAULT_RATE_LIMIT_PER_MINUTE > 0
        else []
    ),
)

# Route path templates never counted against the default limit: probes, provider
# callbacks (Stripe, Resend, payment providers) and the CMS-to-API hook. Matched on the
# route that handled the request, with the API prefix removed, so a path parameter that
# happens to read "ready" or "webhooks" never exempts anything.
DEFAULT_LIMIT_EXEMPT_TEMPLATES = frozenset(
    {
        "/utils/health-check/",
        "/utils/ready/",
        "/wxwatch/ready",
        "/webhooks/resend",
        "/billing/webhooks/stripe",
        "/payments/public/webhooks/{provider}",
        "/content-distribution/internal/posts",
    }
)
LOG_INTERVAL_SECONDS = 60.0
LOG_KEYS_MAX = 512

logger_default = logging.getLogger("src.rate_limit.default")


async def _unmatched_endpoint() -> None:
    """Stand-in handler so unmatched paths and 405s are counted (slowapi skips none)."""


def _first_segment(path: str) -> str | None:
    """The first path segment after the API prefix, or None when it is a parameter
    (or the path is empty): such routes are tried for every request."""
    rest = _template(path)
    segment = rest.lstrip("/").split("/", 1)[0]
    if not segment or "{" in segment:
        return None
    return segment


def _template(route_path: str) -> str:
    prefix = settings.API_V1_STR
    if route_path.startswith(prefix + "/"):
        return route_path[len(prefix) :]
    return route_path


def _internal_network() -> ipaddress.IPv4Network | ipaddress.IPv6Network | None:
    try:
        return ipaddress.ip_network(settings.INTERNAL_CALLER_NETWORK, strict=False)
    except ValueError:
        return None


def _is_internal_call(request: Request) -> bool:
    """A direct call on the internal Docker network, not one that came through Traefik.

    Everything from outside passes Traefik, which always adds ``X-Forwarded-For``, and
    uvicorn trusts that header only from the compose network (``--forwarded-allow-ips``)
    and then reports the visitor as the client. Our web containers call ``http://api:8000``
    with no forwarding header, so uvicorn reports the container's own address. So: no
    forwarding header of any kind, and a client address inside the compose network.
    """
    headers = request.headers
    if any(name in headers for name in ("x-forwarded-for", "forwarded", "x-real-ip")):
        return False
    network = _internal_network()
    if network is None or request.client is None:
        return False
    try:
        address = ipaddress.ip_address(request.client.host)
    except ValueError:
        return False
    return address in network


def _presents_trusted_secret_without_visitor(request: Request) -> bool:
    """A trusted web host's call that names no usable visitor (or hits /auth)."""
    secret = _trusted_secret()
    presented = request.headers.get(VISITOR_SECRET_HEADER)
    if not (secret and presented):
        return False
    try:
        trusted = hmac.compare_digest(presented.encode("utf-8"), secret)
    except UnicodeEncodeError, TypeError:
        return False
    return trusted and _trusted_visitor_ip(request) is None


class DefaultRateLimitMiddleware:
    """Applies the limiter's application limit to routes with no limit of their own.

    Pure ASGI. ``DEFAULT_RATE_LIMIT_MODE``: ``off`` does nothing, ``log`` counts and logs
    what would have been limited but never answers 429, ``enforce`` answers 429. With a
    Redis store the check runs in a worker thread (the client is synchronous) and fails
    open like the decorator; the in-memory store is checked inline. Skipped: routes with
    ``@limiter.limit`` or ``@limiter.exempt``, the templates in
    ``DEFAULT_LIMIT_EXEMPT_TEMPLATES``, direct calls on the internal network, and trusted
    web-host calls that name no visitor. Unmatched paths and 405s are counted.
    """

    def __init__(self, app: ASGIApp, *, limiter: Limiter) -> None:
        self.app = app
        self.limiter = limiter
        self._index: (
            tuple[Any, int, dict[str, list[tuple[int, Any]]], list[tuple[int, Any]]]
            | None
        ) = None
        # (route template, bucket kind) -> [window start, events suppressed in window]
        self._logged: dict[tuple[str, str], list[float]] = {}

    def _routes_index(
        self, app: Any
    ) -> tuple[dict[str, list[tuple[int, Any]]], list[tuple[int, Any]]]:
        """Routes grouped by first static path segment (API prefix removed).

        Built once per app (and again if routes are added), so a request only tries the
        few routes that share its first segment plus the routes that start with a path
        parameter, not every route, and nothing is cached per request path."""
        routes = list(app.routes)
        index = self._index
        if index is None or index[0] is not app or index[1] != len(routes):
            by_segment: dict[str, list[tuple[int, Any]]] = {}
            wild: list[tuple[int, Any]] = []
            for position, route in enumerate(routes):
                segment = _first_segment(getattr(route, "path", ""))
                if segment is None:
                    wild.append((position, route))
                else:
                    by_segment.setdefault(segment, []).append((position, route))
            index = (app, len(routes), by_segment, wild)
            self._index = index
        return index[2], index[3]

    def _resolve(
        self, app: Any, method: str, path: str
    ) -> tuple[Callable[..., Any] | None, str]:
        by_segment, wild = self._routes_index(app)
        segment = _first_segment(path)
        candidates = sorted(
            by_segment.get(segment or "", []) + wild, key=lambda r: r[0]
        )
        scope = {"type": "http", "method": method, "path": path, "root_path": ""}
        for _, route in candidates:
            match, _child = route.matches(scope)
            if match == Match.FULL and hasattr(route, "endpoint"):
                return route.endpoint, _template(getattr(route, "path", ""))
        return None, ""

    def _log_would_limit(self, kind: str, template: str) -> None:
        """One line per (route template, bucket kind) a minute, with the count skipped."""
        key = (template, kind)
        now = time.monotonic()
        entry = self._logged.get(key)
        if entry is not None and now - entry[0] < LOG_INTERVAL_SECONDS:
            entry[1] += 1
            return
        suppressed = int(entry[1]) if entry is not None else 0
        if entry is None and len(self._logged) >= LOG_KEYS_MAX:
            self._logged.clear()
        self._logged[key] = [now, 0]
        logger_default.warning(
            "default rate limit would apply bucket_kind=%s route=%s suppressed=%d",
            kind,
            template or "unmatched",
            suppressed,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        app = scope.get("app")
        mode = settings.DEFAULT_RATE_LIMIT_MODE
        if (
            scope["type"] != "http"
            or app is None
            or mode == "off"
            or not self.limiter.enabled
            or not self.limiter._application_limits
        ):
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive=receive, send=send)
        if _is_internal_call(request) or _presents_trusted_secret_without_visitor(
            request
        ):
            await self.app(scope, receive, send)
            return
        handler, template = self._resolve(app, scope["method"], scope["path"])
        if handler is not None and (
            template in DEFAULT_LIMIT_EXEMPT_TEMPLATES
            or _should_exempt(self.limiter, handler)
        ):
            await self.app(scope, receive, send)
            return
        endpoint = handler or _unmatched_endpoint
        try:
            if isinstance(self.limiter._storage, MemoryStorage):
                self.limiter._check_request_limit(request, endpoint, True)
            else:
                await asyncio.to_thread(
                    self.limiter._check_request_limit, request, endpoint, True
                )
        except RateLimitExceeded as exc:
            if mode == "log":
                kind = (
                    "visitor"
                    if _trusted_visitor_ip(request) is not None
                    else "connecting"
                )
                self._log_would_limit(kind, template)
            else:
                response = _rate_limit_exceeded_handler(request, exc)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


def remember_account(request: Request, account_id: object) -> None:
    """Name the signed-in account whose attempts a route's limit counts.

    Called from a dependency: the limiter reads the key after dependencies have run
    and before the route body, so the account is known in time (see ``account_address``).
    """
    request.state.limit_account = str(account_id)


def account_address(request: Request) -> str:
    """The rate-limit key for a signed-in route: one bucket per account.

    Falls back to ``visitor_address`` when no account was remembered. Web hosts call
    the API server-side, so the visitor address is shared by every user of a host;
    keying on the account stops one person's attempts using up another's.
    """
    account = getattr(request.state, "limit_account", None)
    return f"account:{account}" if account else visitor_address(request)


def mail_limit_address(request: Request) -> str:
    """The bucket for limits on requests that send mail (email codes, setup links).

    The auth web app calls the API server-side, so the connecting address is the
    web host's and shared by every visitor. A host holding the shared secret may
    name the real visitor in ``X-Visitor-IP``, and this honours it on these mail
    routes only: they grant no sign-in, only mail. Without a valid pair the
    connecting address is used. Spoofed ``X-Forwarded-For`` entries are never read.
    """
    ip = _trusted_visitor_ip(request, allow_auth=True)
    if ip is None:
        return connecting_address(request)
    return _bucket(str(ip))
