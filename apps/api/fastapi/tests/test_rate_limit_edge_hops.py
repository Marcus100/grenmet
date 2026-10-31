"""Rate-limit address behind Cloudflare's proxy (VISITOR_IP_PROXY_HOPS, issue #859)."""

from collections.abc import Callable

import pytest
from fastapi import Request

from src.config import settings
from src.rate_limit import (
    VISITOR_IP_HEADER,
    VISITOR_SECRET_HEADER,
    connecting_address,
    connecting_ip,
    visitor_address,
    visitor_ip,
)

SECRET = "web-tier-shared-secret-for-tests-0123456789"
# uvicorn has already set the client to the right-most entry: the peer Traefik saw.
CLOUDFLARE_EDGE = "172.70.1.1"


def _request(*forwarded: str, client: str = CLOUDFLARE_EDGE) -> Request:
    headers = [(b"x-forwarded-for", value.encode("latin-1")) for value in forwarded]
    return Request(
        {
            "type": "http",
            "method": "GET",
            "scheme": "http",
            "server": ("api", 8000),
            "path": "/x",
            "query_string": b"",
            "headers": headers,
            "client": (client, 1234),
        }
    )


SetHops = Callable[[int], None]


@pytest.fixture
def hops(monkeypatch: pytest.MonkeyPatch) -> SetHops:
    def set_hops(value: int) -> None:
        monkeypatch.setattr(settings, "VISITOR_IP_PROXY_HOPS", value)

    return set_hops


def test_one_hop_keeps_uvicorns_address(hops: SetHops) -> None:
    hops(1)
    request = _request(f"198.51.100.4, 203.0.113.7, {CLOUDFLARE_EDGE}")
    assert connecting_address(request) == CLOUDFLARE_EDGE


def test_two_hops_key_on_the_entry_cloudflare_appended(hops: SetHops) -> None:
    hops(2)
    assert (
        connecting_address(_request(f"203.0.113.7, {CLOUDFLARE_EDGE}")) == "203.0.113.7"
    )


def test_a_forged_forwarded_for_changes_nothing(hops: SetHops) -> None:
    hops(2)
    honest = _request(f"203.0.113.7, {CLOUDFLARE_EDGE}")
    forged = _request(f"198.51.100.99, 10.0.0.1, 203.0.113.7, {CLOUDFLARE_EDGE}")
    assert connecting_address(forged) == connecting_address(honest) == "203.0.113.7"


def test_split_forwarded_for_headers_read_as_one_list(hops: SetHops) -> None:
    hops(2)
    request = _request("198.51.100.99", f"203.0.113.7, {CLOUDFLARE_EDGE}")
    assert connecting_address(request) == "203.0.113.7"


@pytest.mark.parametrize(
    "forwarded",
    [
        (),  # server-side call from a web host: no X-Forwarded-For
        (CLOUDFLARE_EDGE,),  # one entry only: not reached through Cloudflare
        (f"not-an-ip, {CLOUDFLARE_EDGE}",),
        (f"fe80::1%eth0, {CLOUDFLARE_EDGE}",),
        (f", {CLOUDFLARE_EDGE}",),
    ],
)
def test_missing_or_malformed_entries_fall_back_to_uvicorn(
    hops: SetHops, forwarded: tuple[str, ...]
) -> None:
    hops(2)
    assert connecting_address(_request(*forwarded)) == CLOUDFLARE_EDGE


def test_ipv4_mapped_visitor_is_unwrapped(hops: SetHops) -> None:
    hops(2)
    request = _request(f"::ffff:203.0.113.7, {CLOUDFLARE_EDGE}")
    assert connecting_address(request) == "203.0.113.7"


def test_rate_limit_and_turnstile_use_the_hop_rule(
    hops: SetHops, monkeypatch: pytest.MonkeyPatch
) -> None:
    hops(2)
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", SECRET)
    request = _request(f"203.0.113.7, {CLOUDFLARE_EDGE}")
    assert visitor_address(request) == "203.0.113.7"
    assert visitor_ip(request) == "203.0.113.7"


def test_trusted_web_host_header_still_wins(
    hops: SetHops, monkeypatch: pytest.MonkeyPatch
) -> None:
    hops(2)
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", SECRET)
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "scheme": "http",
            "server": ("api", 8000),
            "path": "/x",
            "query_string": b"",
            "headers": [
                (VISITOR_IP_HEADER.lower().encode(), b"192.0.2.10"),
                (VISITOR_SECRET_HEADER.lower().encode(), SECRET.encode()),
            ],
            "client": ("172.31.250.20", 1234),
        }
    )
    assert visitor_address(request) == "192.0.2.10"


def test_hops_setting_is_bounded() -> None:
    field = type(settings).model_fields["VISITOR_IP_PROXY_HOPS"]
    assert field.default == 1
    bounds = {type(item).__name__: item for item in field.metadata}
    assert bounds["Ge"].ge == 1
    assert bounds["Le"].le == 5


# ── IPv6: one bucket per /64, as on the trusted web-host path ────────────────


def test_ipv6_visitor_behind_cloudflare_buckets_per_64(hops: SetHops) -> None:
    hops(2)
    one = _request(f"2001:db8:1:2::10, {CLOUDFLARE_EDGE}")
    other = _request(f"2001:db8:1:2:ffff::99, {CLOUDFLARE_EDGE}")
    assert connecting_address(one) == connecting_address(other) == "2001:db8:1:2::/64"
    # The unmasked address stays available for records and Turnstile.
    assert connecting_ip(one) == "2001:db8:1:2::10"
    assert visitor_ip(one) == "2001:db8:1:2::10"


def test_ipv6_direct_client_buckets_per_64(hops: SetHops) -> None:
    hops(1)
    request = _request(client="2001:db8:5:6::1")
    assert connecting_address(request) == "2001:db8:5:6::/64"
    assert connecting_ip(request) == "2001:db8:5:6::1"


def test_ipv4_and_non_ip_clients_keep_their_address(hops: SetHops) -> None:
    hops(1)
    assert connecting_address(_request(client="203.0.113.9")) == "203.0.113.9"
    assert connecting_address(_request(client="testclient")) == "testclient"


def test_rate_limit_key_without_trusted_header_is_the_64(
    hops: SetHops, monkeypatch: pytest.MonkeyPatch
) -> None:
    hops(2)
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", SECRET)
    request = _request(f"2001:db8:9::1, {CLOUDFLARE_EDGE}")
    assert visitor_address(request) == "2001:db8:9::/64"
