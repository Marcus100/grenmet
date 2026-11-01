"""External CAP feed ingestion (src/cap/service.py) — CRUD perms, ingest, dedup and the guards.

Feeds and entries are served by ``httpx.MockTransport``: no network. The host check
(``ensure_public_host``) is patched to allow the test hosts, except where a test
exercises it directly.
"""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import service as cap_service
from src.cap import validation
from src.cap.exceptions import CapImportError
from src.cap.models import CapAlert, CapFeedImport, CapIntegrationStatus
from src.cap.schemas import CapFeedImportCreate
from src.exceptions import AuthorizationError
from tests.factories import make_user

FEED_URL = "https://feeds.test/cap.rss"

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


@pytest.fixture(autouse=True)
def _allow_test_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    async def allowed(_host: str) -> None:
        return None

    monkeypatch.setattr(cap_service, "ensure_public_host", allowed)


def _rss(links: list[str]) -> bytes:
    items = "".join(f"<item><link>{link}</link></item>" for link in links)
    return (
        '<?xml version="1.0"?><rss version="2.0"><channel>'
        f"<title>peer</title>{items}</channel></rss>"
    ).encode()


def _feed_handler(
    links: list[str], bodies: dict[str, bytes], etag: str = "etag-1"
) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == FEED_URL:
            return httpx.Response(200, content=_rss(links), headers={"etag": etag})
        return httpx.Response(200, content=bodies[url])

    return httpx.MockTransport(handler)


async def _feed_row(db: AsyncSession, url: str = FEED_URL) -> CapFeedImport:
    row = CapFeedImport(name="GD peer", url=url)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def test_feed_crud_requires_permission(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    with pytest.raises(AuthorizationError):
        await cap_service.create_feed(
            session=db_async,
            current_user=user,
            payload=CapFeedImportCreate(name="x", url="https://x.test/feed"),
        )


async def test_ingest_feed_creates_then_dedupes(db_async: AsyncSession) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed_row(db_async)
    bodies = {"https://feeds.test/a.xml": _ENTRY_XML}
    async with httpx.AsyncClient(
        transport=_feed_handler(["https://feeds.test/a.xml"], bodies)
    ) as client:
        first = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )
        second = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )

    assert first == {"created": 1, "skipped": 0}
    assert second == {"created": 0, "skipped": 1}
    assert feed.last_etag == "etag-1"
    assert feed.last_error is None
    got = await db_async.execute(
        select(CapAlert).where(CapAlert.identifier == "FEED-001")
    )
    stored = got.scalars().first()
    assert stored is not None and stored.import_source == "feed"


async def test_ingest_all_active_feeds_uses_seeded_superuser(
    db_async: AsyncSession,
) -> None:
    await make_user(db_async, superuser=True)
    feed = CapFeedImport(
        name="GD peer",
        url=FEED_URL,
        status=CapIntegrationStatus.ACTIVE,
    )
    db_async.add(feed)
    await db_async.commit()
    bodies = {"https://feeds.test/b.xml": _ENTRY_XML.replace(b"FEED-001", b"FEED-002")}
    async with httpx.AsyncClient(
        transport=_feed_handler(["https://feeds.test/b.xml"], bodies)
    ) as client:
        processed = await cap_service.ingest_all_active_feeds(
            session=db_async, http_client=client
        )

    assert processed == 1
    got = await db_async.execute(
        select(CapAlert).where(CapAlert.identifier == "FEED-002")
    )
    assert got.scalars().first() is not None


async def test_a_poison_entry_is_skipped_and_the_feed_carries_on(
    db_async: AsyncSession,
) -> None:
    """Nesting past libxml2's depth limit (256) is refused as a bad entry, not a crash."""
    su = await make_user(db_async, superuser=True)
    feed = await _feed_row(db_async)
    deep = b"<a>" * 300 + b"</a>" * 300
    bodies = {
        "https://feeds.test/bad.xml": deep,
        "https://feeds.test/good.xml": _ENTRY_XML,
    }
    links = ["https://feeds.test/bad.xml", "https://feeds.test/good.xml"]
    async with httpx.AsyncClient(
        transport=_feed_handler(links, bodies, etag="etag-9")
    ) as client:
        result = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )

    assert result == {"created": 1, "skipped": 1}
    assert feed.last_etag == "etag-9"
    assert feed.last_error is None


async def test_an_oversized_entry_is_skipped(db_async: AsyncSession) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed_row(db_async)
    big = b"<!-- " + b"x" * (cap_service.MAX_IMPORT_BYTES + 10) + b" -->" + _ENTRY_XML
    bodies = {
        "https://feeds.test/big.xml": big,
        "https://feeds.test/good.xml": _ENTRY_XML.replace(b"FEED-001", b"FEED-GOOD"),
    }
    links = ["https://feeds.test/big.xml", "https://feeds.test/good.xml"]
    async with httpx.AsyncClient(transport=_feed_handler(links, bodies)) as client:
        result = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )

    assert result == {"created": 1, "skipped": 1}


async def test_an_unreachable_feed_records_the_error_and_stays_retryable(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed_row(db_async)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )

    assert result == {"created": 0, "skipped": 0}
    assert feed.last_error and "HTTPStatusError" in feed.last_error


async def test_a_private_feed_address_is_refused_before_any_request(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed_row(db_async, url="http://127.0.0.1/cap.rss")
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, content=_rss([]))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )

    assert result == {"created": 0, "skipped": 0}
    assert requested == []
    assert feed.last_error and "non-public" in feed.last_error


async def test_the_host_check_runs_even_with_an_injected_client(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The DNS check is not skipped for a client the caller supplies."""
    monkeypatch.setattr(
        cap_service, "ensure_public_host", validation.ensure_public_host
    )
    su = await make_user(db_async, superuser=True)
    feed = await _feed_row(db_async, url="https://no-such-host.invalid/cap.rss")
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, content=_rss([]))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )

    assert result == {"created": 0, "skipped": 0}
    assert requested == []
    assert feed.last_error and "could not resolve" in feed.last_error


async def test_an_entry_from_a_private_address_is_skipped(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed_row(db_async)
    links = ["http://10.0.0.5/entry.xml"]
    async with httpx.AsyncClient(transport=_feed_handler(links, {})) as client:
        with pytest.raises(CapImportError):
            await cap_service.import_alert(
                session=db_async,
                current_user=su,
                source="url",
                value=links[0],
                http_client=client,
            )
        result = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )

    assert result == {"created": 0, "skipped": 1}
