"""Meta Graph API calls for Facebook Page and Instagram posts (worker side only).

Only the outbox handlers in ``service.py`` use this module. Calls go to
``graph.facebook.com`` with async httpx and timeouts. The access token travels in an
``Authorization`` header, so it never appears in a URL, a log line or an exception.

Each call ends in one of four outcomes, and the handler acts on each one:

- a post id: the post is live;
- ``GraphRetryable``: nothing was published. The handler clears its in-flight marker
  and the outbox tries again later;
- ``GraphRejected``: Meta refused the request (a 4xx other than a rate limit). The
  handler records the reason and never retries;
- ``GraphOutcomeUnknown``: the publish request was sent and no usable answer came
  back (timeout, dropped connection, unreadable success). The post may be live, so
  the handler records it for a person to check and never sends it again.

Inside one call, HTTP 429, 5xx and the Graph rate-limit codes back off and honour
``Retry-After`` (waits longer than ``MAX_WAIT_SECONDS`` are left to the outbox). A
connection that was never opened is retried. Only the publish requests can end as
``GraphOutcomeUnknown``: creating an Instagram container publishes nothing.
"""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, Final

import httpx

GRAPH_BASE_URL: Final = "https://graph.facebook.com"
# Five seconds to connect, fifteen for the whole request.
TIMEOUT: Final = httpx.Timeout(15.0, connect=5.0)
MAX_ATTEMPTS: Final = 3
BACKOFF_SECONDS: Final = 2.0
MAX_WAIT_SECONDS: Final = 30.0
# Graph's application and user rate-limit codes. Sent with HTTP 400, not 429.
RATE_LIMIT_CODES: Final = frozenset({4, 17, 32, 613})
# Instagram containers are polled this many times, this far apart, before giving up.
STATUS_CHECKS: Final = 5
STATUS_CHECK_SECONDS: Final = 2.0
_DETAIL_LIMIT: Final = 200
_ERROR_LIMIT: Final = 300

# Test seams: an httpx transport (MockTransport in tests) and the wait function.
_transport: httpx.AsyncBaseTransport | None = None
_sleep: Callable[[float], Awaitable[None]] = asyncio.sleep


class GraphError(Exception):
    """Base class. ``message`` is safe to store for staff: no token, no post text."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class GraphRetryable(GraphError):
    """Nothing was published. The outbox may try again later."""


class GraphRejected(GraphError):
    """Meta refused the request. Trying again will not change the answer."""


class GraphOutcomeUnknown(GraphError):
    """A publish request went out and no usable answer came back."""


def _never_sent(exc: httpx.HTTPError) -> bool:
    return isinstance(
        exc, (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)
    )


def _backoff(attempt: int) -> float:
    # A float base keeps mypy from typing the power as Any.
    return BACKOFF_SECONDS * (2.0 ** (attempt - 1))


def _json_object(response: httpx.Response) -> dict[str, Any] | None:
    try:
        body = response.json()
    except ValueError:
        return None
    return body if isinstance(body, dict) else None


def _retry_after(response: httpx.Response) -> float | None:
    value = response.headers.get("Retry-After")
    if value is None:
        return None
    try:
        seconds = float(value)
    except ValueError:
        return None
    return seconds if seconds >= 0 else None


def _error_detail(response: httpx.Response) -> tuple[int | None, str | None]:
    body = _json_object(response)
    error = body.get("error") if body is not None else None
    if not isinstance(error, dict):
        return None, None
    code = error.get("code")
    message = error.get("message")
    return (
        code if isinstance(code, int) and not isinstance(code, bool) else None,
        message if isinstance(message, str) else None,
    )


def _rejection(status: int, code: int | None, detail: str | None, token: str) -> str:
    text = f"Meta rejected the request (HTTP {status}"
    if code is not None:
        text += f", error code {code}"
    text += ")"
    if detail:
        # Belt and braces: Meta does not echo tokens, but a stored reason must never carry one.
        text += ": " + detail.replace(token, "[redacted]")[:_DETAIL_LIMIT]
    return text[:_ERROR_LIMIT]


def _graph_id(
    body: dict[str, Any], keys: tuple[str, ...], error_type: type[GraphError]
) -> str:
    for key in keys:
        value = body.get(key)
        if isinstance(value, str) and value:
            return value
    raise error_type("Meta answered without an id")


class GraphClient:
    """Calls for one account. Build one per attempt; the token is held in memory only."""

    def __init__(self, *, access_token: str, api_version: str) -> None:
        self._access_token = access_token
        self._api_version = api_version

    async def get(self, path: str, *, params: dict[str, str]) -> dict[str, Any]:
        return await self._send("GET", path, params=params, data=None, publishing=False)

    async def post(
        self, path: str, *, data: dict[str, str], publishing: bool = False
    ) -> dict[str, Any]:
        return await self._send(
            "POST", path, params=None, data=data, publishing=publishing
        )

    async def _send(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None,
        data: dict[str, str] | None,
        publishing: bool,
    ) -> dict[str, Any]:
        url = f"{GRAPH_BASE_URL}/{self._api_version}/{path}"
        headers = {"Authorization": f"Bearer {self._access_token}"}
        attempt = 0
        # Every pass either returns or raises, or sleeps and tries again.
        while True:
            attempt += 1
            try:
                async with httpx.AsyncClient(
                    timeout=TIMEOUT,
                    transport=_transport,
                    follow_redirects=False,
                    trust_env=False,
                ) as client:
                    response = await client.request(
                        method, url, params=params, data=data, headers=headers
                    )
            except httpx.HTTPError as exc:
                if publishing and not _never_sent(exc):
                    raise GraphOutcomeUnknown(
                        "No answer from Meta after the publish request"
                    ) from None
                if attempt == MAX_ATTEMPTS:
                    raise GraphRetryable("Could not reach Meta") from None
                await _sleep(_backoff(attempt))
                continue

            if response.is_success:
                body = _json_object(response)
                if body is not None:
                    return body
                if publishing:
                    raise GraphOutcomeUnknown(
                        "Meta answered the publish request without a readable result"
                    )
                raise GraphRetryable("Meta answered without a readable result")

            code, detail = _error_detail(response)
            busy = (
                response.status_code == 429
                or response.status_code >= 500
                or code in RATE_LIMIT_CODES
            )
            if busy:
                retry_after = _retry_after(response)
                wait = _backoff(attempt) if retry_after is None else retry_after
                if attempt == MAX_ATTEMPTS or wait > MAX_WAIT_SECONDS:
                    raise GraphRetryable(f"Meta is busy (HTTP {response.status_code})")
                await _sleep(wait)
                continue
            raise GraphRejected(
                _rejection(response.status_code, code, detail, self._access_token)
            )


async def publish_facebook(
    client: GraphClient,
    *,
    page_id: str,
    message: str,
    link: str,
    image_url: str | None,
) -> str:
    """A link post on the Page, or a photo post when the content has a social image.

    A photo post cannot carry a clickable link, so the link is written into the text.
    Returns the id of the Page post."""
    if image_url is None:
        body = await client.post(
            f"{page_id}/feed",
            data={"message": message, "link": link},
            publishing=True,
        )
        return _graph_id(body, ("id",), GraphOutcomeUnknown)
    body = await client.post(
        f"{page_id}/photos",
        data={
            "url": image_url,
            "message": _with_link(message, link),
            "published": "true",
        },
        publishing=True,
    )
    return _graph_id(body, ("post_id", "id"), GraphOutcomeUnknown)


async def publish_instagram(
    client: GraphClient, *, account_id: str, caption: str, image_url: str
) -> str:
    """Create an image container, wait until Meta has processed it, then publish it.

    Only the last step publishes, so only that step can end as an unknown outcome.
    An unfinished container is harmless: it publishes nothing and expires."""
    created = await client.post(
        f"{account_id}/media", data={"image_url": image_url, "caption": caption}
    )
    container_id = _graph_id(created, ("id",), GraphRetryable)
    await _wait_until_ready(client, container_id)
    published = await client.post(
        f"{account_id}/media_publish",
        data={"creation_id": container_id},
        publishing=True,
    )
    return _graph_id(published, ("id",), GraphOutcomeUnknown)


async def _wait_until_ready(client: GraphClient, container_id: str) -> None:
    for check in range(STATUS_CHECKS):
        body = await client.get(container_id, params={"fields": "status_code"})
        status = body.get("status_code")
        if status == "FINISHED":
            return
        if status in {"ERROR", "EXPIRED"}:
            raise GraphRejected("Instagram could not process the image")
        if check < STATUS_CHECKS - 1:
            await _sleep(STATUS_CHECK_SECONDS)
    raise GraphRetryable("Instagram is still processing the image")


def _with_link(message: str, link: str) -> str:
    if not link or link in message:
        return message
    return f"{message}\n\n{link}" if message else link
