"""Signing helpers and the SSRF guard, without a database."""

import pytest

from src.utils.signing import (
    sign_body,
    sign_timestamped,
    verify_timestamped,
)
from src.webhooks_out import events, ssrf

SECRET = "whsec_example"
BODY = b'{"id":"evt_1"}'


def test_valid_signature_verifies() -> None:
    header = sign_timestamped(SECRET, BODY, 1_700_000_000)
    assert header.startswith("t=1700000000,v1=")
    assert verify_timestamped(SECRET, BODY, header, now=1_700_000_010)


def test_tampered_body_wrong_secret_and_garbage_fail() -> None:
    header = sign_timestamped(SECRET, BODY, 1_700_000_000)
    assert not verify_timestamped(SECRET, BODY + b" ", header, now=1_700_000_000)
    assert not verify_timestamped("whsec_other", BODY, header, now=1_700_000_000)
    for garbage in ("", "v1=abc", "t=x,v1=abc", "t=1700000000"):
        assert not verify_timestamped(SECRET, BODY, garbage, now=1_700_000_000)


def test_stale_or_future_timestamps_are_rejected() -> None:
    header = sign_timestamped(SECRET, BODY, 1_700_000_000)
    assert not verify_timestamped(SECRET, BODY, header, now=1_700_000_301)
    assert not verify_timestamped(SECRET, BODY, header, now=1_699_999_699)
    assert verify_timestamped(
        SECRET, BODY, header, now=1_700_000_301, tolerance_seconds=600
    )


def test_cap_body_signature_is_unchanged() -> None:
    # Known vector: HMAC-SHA256("secret", "body") as CAP has always sent it.
    assert (
        sign_body("secret", b"body")
        == "sha256=dc46983557fea127b43af721467eb9b3fde2338fe3e14f51952aa8478c13d355"
    )


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.9",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "fe80::1",
        "fc00::1",
        "::ffff:127.0.0.1",
        "::ffff:10.0.0.1",
        "2002:7f00:0001::1",
        "not-an-ip",
    ],
)
def test_non_public_addresses_are_refused(address: str) -> None:
    assert not ssrf.is_public_ip(address)


@pytest.mark.parametrize("address", ["93.184.216.34", "8.8.8.8", "2606:4700::1111"])
def test_public_addresses_pass(address: str) -> None:
    assert ssrf.is_public_ip(address)


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/h",
        "ftp://example.com/h",
        "https://user:pw@example.com/h",
        "https://localhost/h",
        "https://api.localhost/h",
        "https:///nohost",
        "https://example.com:0/h",
        "https://example.com/h#frag",
        "https://example.com:notaport/h",
        "https://example.com/" + "a" * 2100,
    ],
)
def test_bad_url_shapes_are_refused(url: str) -> None:
    with pytest.raises(ssrf.UnsafeTargetError):
        ssrf.parse_url(url)


async def test_ip_literals_are_checked_by_resolution(monkeypatch) -> None:
    async def literal(host: str) -> list[str]:
        return [host]

    monkeypatch.setattr(ssrf, "resolve_host", literal)
    with pytest.raises(ssrf.UnsafeTargetError):
        await ssrf.check_url("https://127.0.0.1/h")
    with pytest.raises(ssrf.UnsafeTargetError):
        await ssrf.check_url("https://[::1]/h")
    await ssrf.check_url("https://93.184.216.34/h")


async def test_unresolvable_hosts_are_refused(monkeypatch) -> None:
    async def nothing(_: str) -> list[str]:
        return []

    monkeypatch.setattr(ssrf, "resolve_host", nothing)
    with pytest.raises(ssrf.UnsafeTargetError, match="resolve"):
        await ssrf.check_url("https://nowhere.example.com/h")


def test_subscription_rules() -> None:
    assert events.validate_subscription(["booking.created", "booking.created"]) == [
        "booking.created"
    ]
    assert events.validate_subscription(["booking.created", "*"]) == ["*"]
    with pytest.raises(ValueError):
        events.validate_subscription(["ping"])
    with pytest.raises(ValueError):
        events.validate_subscription(["nope.nope"])
