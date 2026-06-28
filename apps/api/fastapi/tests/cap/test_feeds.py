"""External CAP feed ingestion (src/cap/service.py) — CRUD perms + ingest/dedup.

feedparser is monkeypatched and entry fetches use httpx.MockTransport (no network).
"""

import types

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.cap import service as cap_service
from src.cap.models import CapAlert, CapFeedImport, CapIntegrationStatus
from src.cap.schemas import CapFeedImportCreate
from src.exceptions import AuthorizationError
from tests.factories import make_user

_ENTRY_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>FEED-001</identifier>
  <sender>peer@agency.test</sender>
  <sent>2026-06-28T10:00:00+00:00</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <info>
    <category>Met</category>
    <event>Storm</event>
    <urgency>Expected</urgency>
    <severity>Moderate</severity>
    <certainty>Likely</certainty>
    <headline>Storm Watch</headline>
    <description>A storm is approaching.</description>
  </info>
</alert>"""


def _patch_feedparser(monkeypatch: pytest.MonkeyPatch, links: list[str]) -> None:
    def fake_parse(url: str, etag: str | None = None) -> types.SimpleNamespace:
        _ = (url, etag)  # signature must match feedparser.parse
        return types.SimpleNamespace(
            entries=[{"link": link} for link in links], status=200, etag="etag-1"
        )

    monkeypatch.setattr(cap_service.feedparser, "parse", fake_parse)


async def test_feed_crud_requires_permission(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    with pytest.raises(AuthorizationError):
        await cap_service.create_feed(
            session=db_async,
            current_user=user,
            payload=CapFeedImportCreate(name="x", url="https://x.test/feed"),
        )


async def test_ingest_feed_creates_then_dedupes(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = CapFeedImport(name="GD peer", url="https://feeds.test/cap.rss")
    db_async.add(feed)
    await db_async.commit()
    await db_async.refresh(feed)

    _patch_feedparser(monkeypatch, ["https://feeds.test/a.xml"])

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=_ENTRY_XML)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        first = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )
        second = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )

    assert first == {"created": 1, "skipped": 0}
    assert second == {"created": 0, "skipped": 1}
    assert feed.last_etag == "etag-1"
    got = await db_async.execute(
        select(CapAlert).where(CapAlert.identifier == "FEED-001")
    )
    assert got.scalars().first() is not None


async def test_ingest_all_active_feeds_uses_seeded_superuser(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    feed = CapFeedImport(
        name="GD peer",
        url="https://feeds.test/cap.rss",
        status=CapIntegrationStatus.ACTIVE,
    )
    db_async.add(feed)
    await db_async.commit()

    _patch_feedparser(monkeypatch, ["https://feeds.test/b.xml"])

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=_ENTRY_XML.replace(b"FEED-001", b"FEED-002"))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        processed = await cap_service.ingest_all_active_feeds(
            session=db_async, http_client=client
        )

    assert processed == 1
    got = await db_async.execute(
        select(CapAlert).where(CapAlert.identifier == "FEED-002")
    )
    assert got.scalars().first() is not None
