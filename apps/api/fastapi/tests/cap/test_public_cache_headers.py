"""Public CAP feeds tell Cloudflare it may keep them for a minute (storm cache).

Owner decision 2026-11-15 (docs/operations/cloudflare-storm-cache.md): public,
same-for-everyone feeds are cacheable at the edge for at most 60 seconds; staff
routes, errors and the signed attachment redirect never are.
"""

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.router import PUBLIC_FEED_CACHE
from tests.cap.test_public_view import _published


def _directives(header: str) -> dict[str, str]:
    parts = (part.strip().split("=", 1) for part in header.split(","))
    return {part[0]: part[1] if len(part) > 1 else "" for part in parts}


def test_public_feed_cache_is_public_and_one_minute_at_most() -> None:
    directives = _directives(PUBLIC_FEED_CACHE)
    assert "public" in directives
    assert "private" not in directives
    assert int(directives["s-maxage"]) <= 60
    assert int(directives["max-age"]) == 0
    # No stale-while-revalidate: a cached copy is never more than a minute old
    # unless the origin is failing.
    assert "stale-while-revalidate" not in directives


@pytest.mark.usefixtures("db_async")
async def test_public_feeds_send_the_storm_cache_header(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    identifier = await _published(db_async)

    for path in (
        "/api/cap/latest-active",
        "/api/cap/alerts",
        "/api/cap/past",
        f"/api/cap/alerts/{identifier}",
        "/api/cap/alerts.geojson",
        "/api/cap/active-map",
        "/api/cap/rss.xml",
        f"/api/cap/{identifier}.xml",
    ):
        response = await async_client.get(path)
        assert response.status_code == 200, (path, response.text)
        assert response.headers["cache-control"] == PUBLIC_FEED_CACHE, path
        assert "set-cookie" not in response.headers, path


@pytest.mark.usefixtures("db_async")
async def test_errors_and_staff_routes_are_never_marked_cacheable(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    missing = await async_client.get("/api/cap/alerts/no-such-alert")
    assert missing.status_code == 404
    assert "s-maxage" not in missing.headers.get("cache-control", "")

    missing_xml = await async_client.get("/api/cap/no-such-alert.xml")
    assert missing_xml.status_code == 404
    assert "s-maxage" not in missing_xml.headers.get("cache-control", "")

    staff = await async_client.get(
        "/api/v1/cap/alerts", headers=superuser_token_headers_async
    )
    assert staff.status_code == 200, staff.text
    assert "public" not in staff.headers.get("cache-control", "")
