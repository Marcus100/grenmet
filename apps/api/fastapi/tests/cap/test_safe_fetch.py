"""The CAP fetch connects to the checked address, and refuses what it must not fetch.

Network-free: a fake httpx transport records every request, so the test sees the
address the connection would go to, and the URL the request would send.
"""

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
