"""Request IDs tie a response, its log lines and its Sentry events together."""

import logging

import httpx
import pytest

from src.config import settings
from src.main import app
from src.request_context import (
    REQUEST_ID_HEADER,
    RequestIdFilter,
    bind_request_id,
    current_request_id,
    reset_request_id,
    resolve_request_id,
)
from src.telemetry import scrub_sentry_event

HEALTH = f"{settings.API_V1_STR}/utils/health-check/"


@pytest.fixture
async def client() -> httpx.AsyncClient:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


async def test_response_carries_a_generated_request_id(
    client: httpx.AsyncClient,
) -> None:
    first = await client.get(HEALTH)
    second = await client.get(HEALTH)
    assert len(first.headers[REQUEST_ID_HEADER]) == 32
    assert first.headers[REQUEST_ID_HEADER] != second.headers[REQUEST_ID_HEADER]


async def test_a_well_formed_incoming_id_is_reused(client: httpx.AsyncClient) -> None:
    response = await client.get(HEALTH, headers={REQUEST_ID_HEADER: "web-4f9a2c71"})
    assert response.headers[REQUEST_ID_HEADER] == "web-4f9a2c71"


@pytest.mark.parametrize(
    "incoming",
    ["short", "x" * 65, "has spaces in it", "semi;colon-injection"],
)
async def test_a_malformed_incoming_id_is_replaced(
    client: httpx.AsyncClient, incoming: str
) -> None:
    response = await client.get(HEALTH, headers={REQUEST_ID_HEADER: incoming})
    assert response.headers[REQUEST_ID_HEADER] != incoming
    assert len(response.headers[REQUEST_ID_HEADER]) == 32


async def test_the_request_log_line_names_the_id(
    client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="src.request"):
        response = await client.get(HEALTH)
    request_id = response.headers[REQUEST_ID_HEADER]
    assert any(f"request_id={request_id}" in line for line in caplog.messages)


async def test_the_id_does_not_leak_into_the_next_request(
    client: httpx.AsyncClient,
) -> None:
    await client.get(HEALTH)
    assert current_request_id() is None


def test_resolve_request_id_accepts_only_plain_tokens() -> None:
    assert resolve_request_id("abcd1234") == "abcd1234"
    assert resolve_request_id(None) != resolve_request_id(None)
    assert resolve_request_id("bad id!") != "bad id!"
    for hostile in ("ünïcode-ünïcode", "line\nbreak-123456", "a" * 65, ""):
        assert resolve_request_id(hostile) != hostile


def test_log_filter_attaches_the_bound_id_or_a_dash() -> None:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "msg", None, None)
    RequestIdFilter().filter(record)
    assert record.__dict__["request_id"] == "-"
    token = bind_request_id("req-12345678")
    try:
        RequestIdFilter().filter(record)
        assert record.__dict__["request_id"] == "req-12345678"
    finally:
        reset_request_id(token)


def test_sentry_scrubber_keeps_the_request_id_tag_but_no_other_identifiers() -> None:
    event = scrub_sentry_event(
        {"tags": {"request_id": "req-12345678", "email": "a@b.c", "area": "cap"}}, {}
    )
    assert event["tags"] == {"request_id": "req-12345678", "area": "cap"}
