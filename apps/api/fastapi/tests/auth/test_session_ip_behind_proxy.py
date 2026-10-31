"""Sign-in sessions record the visitor, not a Cloudflare edge (issue #859)."""

import re
from pathlib import Path

import httpx
import pytest
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Session
from src.auth.routers.login import _request_metadata
from src.config import settings
from src.rate_limit import request_ip
from tests.factories import make_user

CLOUDFLARE_EDGE = "172.70.1.1"
AUTH_SOURCE = Path(__file__).resolve().parents[2] / "src" / "auth"
CLIENT_HOST = re.compile(r"request\.client\.host")


def _request(forwarded: str | None, client: tuple[str, int] | None) -> Request:
    headers = [(b"user-agent", b"probe/1")]
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "http",
            "server": ("api", 8000),
            "path": "/api/v1/auth/sessions",
            "query_string": b"",
            "headers": headers,
            "client": client,
        }
    )


def test_request_ip_is_the_visitor_behind_cloudflare(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "VISITOR_IP_PROXY_HOPS", 2)
    forged = _request(
        f"198.51.100.99, 203.0.113.7, {CLOUDFLARE_EDGE}", (CLOUDFLARE_EDGE, 1)
    )
    assert request_ip(forged) == "203.0.113.7"
    # Unmasked: a session stores one address, not the IPv6 /64 rate-limit bucket.
    ipv6 = _request(f"2001:db8::7, {CLOUDFLARE_EDGE}", (CLOUDFLARE_EDGE, 1))
    assert request_ip(ipv6) == "2001:db8::7"
    assert _request_metadata(forged) == ("probe/1", "203.0.113.7")


def test_request_ip_without_a_client_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "VISITOR_IP_PROXY_HOPS", 2)
    assert request_ip(_request(f"203.0.113.7, {CLOUDFLARE_EDGE}", None)) is None


def test_one_hop_keeps_uvicorns_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "VISITOR_IP_PROXY_HOPS", 1)
    request = _request(f"203.0.113.7, {CLOUDFLARE_EDGE}", (CLOUDFLARE_EDGE, 1))
    assert request_ip(request) == CLOUDFLARE_EDGE


def test_auth_never_reads_the_raw_client_host() -> None:
    offenders = [
        str(path.relative_to(AUTH_SOURCE))
        for path in AUTH_SOURCE.rglob("*.py")
        if CLIENT_HOST.search(path.read_text())
    ]
    assert offenders == [], "use src.rate_limit.request_ip() for session addresses"


async def test_password_sign_in_records_the_visitor_behind_cloudflare(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "VISITOR_IP_PROXY_HOPS", 2)
    user = await make_user(db_async)
    response = await async_client.post(
        "/api/v1/auth/sessions",
        json={"email": user.email, "password": "password123"},
        headers={"X-Forwarded-For": f"198.51.100.99, 203.0.113.7, {CLOUDFLARE_EDGE}"},
    )
    assert response.status_code == 200, response.text
    recorded = (
        (await db_async.execute(select(Session).where(Session.user_id == user.id)))
        .scalars()
        .all()
    )
    assert [session.ip_address for session in recorded] == ["203.0.113.7"]
