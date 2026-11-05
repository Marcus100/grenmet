"""The CAP fetch connects to the checked address, and refuses what it must not fetch.

Network-free: a fake httpx transport records every request, so the test sees the
address the connection would go to, and the URL the request would send.
"""

from typing import Any

import httpx
import pytest

from src.cap.exceptions import CapImportError
from src.cap.safe_fetch import fetch_pinned


class RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(
        self, status: int = 200, body: bytes = b"<alert/>", headers: dict | None = None
    ) -> None:
        self.requests: list[httpx.Request] = []
        self.status = status
        self.body = body
        self.headers = headers or {}

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(
            self.status, content=self.body, headers=self.headers, request=request
        )


def _client(transport: RecordingTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=transport)


async def test_the_connection_goes_to_the_checked_address_and_keeps_the_host_name() -> (
    None
):
    transport = RecordingTransport()
    async with _client(transport) as client:
        fetched = await fetch_pinned(
            client,
            "https://feeds.example.test:8443/cap.xml?x=1&y=two",
            address="93.184.216.34",
            max_bytes=1024,
        )

    assert fetched.status == 200
    (request,) = transport.requests
    assert request.url.host == "93.184.216.34"  # the address we checked
    assert request.url.port == 8443
    assert request.url.path == "/cap.xml"
    assert request.url.params["x"] == "1" and request.url.params["y"] == "two"
    assert (
        request.headers["host"] == "feeds.example.test:8443"
    )  # the name, for the Host header
    assert (
        request.extensions["sni_hostname"] == "feeds.example.test"
    )  # the name, for TLS


async def test_an_ipv6_address_is_bracketed() -> None:
    transport = RecordingTransport()
    async with _client(transport) as client:
        await fetch_pinned(
            client,
            "https://feeds.example.test/cap.xml",
            address="2606:2800:220:1::1",
            max_bytes=1024,
        )
    assert transport.requests[0].url.host == "2606:2800:220:1::1"


async def test_the_path_is_re_encoded_and_user_text_is_not_sent_whole() -> None:
    transport = RecordingTransport()
    async with _client(transport) as client:
        await fetch_pinned(
            client,
            "https://feeds.example.test/a b/cap.xml?q=x y",
            address="93.184.216.34",
            max_bytes=1024,
        )
    url = str(transport.requests[0].url)
    assert " " not in url
    assert url.startswith("https://93.184.216.34/")


@pytest.mark.parametrize(
    "url",
    [
        "http://feeds.example.test/cap.xml",
        "ftp://feeds.example.test/cap.xml",
        "file:///etc/passwd",
    ],
)
async def test_only_https_is_fetched_unless_a_registered_feed_is_plain_http(
    url: str,
) -> None:
    transport = RecordingTransport()
    async with _client(transport) as client:
        with pytest.raises(CapImportError):
            await fetch_pinned(client, url, address="93.184.216.34", max_bytes=1024)
    assert transport.requests == []


async def test_plain_http_is_allowed_only_when_the_caller_says_so() -> None:
    transport = RecordingTransport()
    async with _client(transport) as client:
        await fetch_pinned(
            client,
            "http://feeds.example.test/cap.xml",
            address="93.184.216.34",
            max_bytes=1024,
            allow_http=True,
        )
    assert transport.requests[0].url.scheme == "http"
    assert transport.requests[0].url.host == "93.184.216.34"


async def test_a_redirect_is_not_followed() -> None:
    transport = RecordingTransport(
        status=302, headers={"location": "https://elsewhere.example.test/x"}
    )
    async with _client(transport) as client:
        with pytest.raises(CapImportError, match="redirects are not followed"):
            await fetch_pinned(
                client,
                "https://feeds.example.test/cap.xml",
                address="93.184.216.34",
                max_bytes=1024,
            )
    assert len(transport.requests) == 1


async def test_a_body_over_the_cap_is_refused_while_it_is_read() -> None:
    transport = RecordingTransport(body=b"x" * 2048)
    async with _client(transport) as client:
        with pytest.raises(CapImportError, match="byte limit"):
            await fetch_pinned(
                client,
                "https://feeds.example.test/cap.xml",
                address="93.184.216.34",
                max_bytes=1024,
            )


async def test_a_not_modified_feed_is_reported_without_a_body() -> None:
    transport = RecordingTransport(status=304)
    async with _client(transport) as client:
        fetched = await fetch_pinned(
            client,
            "https://feeds.example.test/cap.xml",
            address="93.184.216.34",
            max_bytes=1024,
            headers={"If-None-Match": "etag-1"},
        )
    assert fetched.status == 304 and fetched.body == b""
    assert transport.requests[0].headers["if-none-match"] == "etag-1"


async def test_feed_and_import_clients_ignore_proxy_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Proxy variables must not route a fetch around the pinned address."""
    from src.cap import service as cap_service

    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:9")
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:9")
    seen: list[dict[str, object]] = []

    class Spy(httpx.AsyncClient):
        def __init__(self, **kwargs: Any) -> None:
            seen.append(kwargs)
            super().__init__(**kwargs)

    class Stop(Exception):
        pass

    async def pinned_address(_host: str) -> str:
        return "203.0.113.10"

    async def stop_before_network(*_args: object, **_kwargs: object) -> None:
        raise Stop

    monkeypatch.setattr(cap_service.httpx, "AsyncClient", Spy)
    monkeypatch.setattr(cap_service, "ensure_public_host", pinned_address)
    monkeypatch.setattr(cap_service, "fetch_pinned", stop_before_network)

    with pytest.raises(Stop):
        await cap_service._fetch_document(
            "https://feeds.example.com/cap.xml", http_client=None
        )

    assert seen == [{"trust_env": False}]
