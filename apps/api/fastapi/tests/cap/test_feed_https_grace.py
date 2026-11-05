"""Plain-http CAP feeds: first flag, 14-day grace, then no more fetches.

New feeds must be https on port 443 (``tests/cap/test_feed_and_settings_guards.py``).
A feed saved earlier on http is flagged the first time it is polled (or by the
migration), keeps working for 14 days, and is then skipped, never deleted.
"""

import logging
from datetime import datetime, timedelta

import httpx
import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import service as cap_service
from src.cap.exceptions import CapFeedUrlError
from src.cap.models import CapFeedImport, CapIntegrationStatus
from src.cap.schemas import CapFeedImportCreate, CapFeedImportUpdate
from src.utils.datetime import utc_now
from tests.factories import make_user

HTTP_FEED = "http://legacy.example.org/cap.rss"
HTTPS_FEED = "https://legacy.example.org/cap.rss"
RSS = (
    b'<?xml version="1.0"?><rss version="2.0"><channel><title>p</title></channel></rss>'
)


@pytest.fixture(autouse=True)
def _allow_test_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    async def allowed(_host: str) -> None:
        return None

    monkeypatch.setattr(cap_service, "ensure_public_host", allowed)


async def _feed(
    db: AsyncSession,
    url: str = HTTP_FEED,
    *,
    insecure_since: datetime | None = None,
    last_error: str | None = None,
) -> CapFeedImport:
    row = CapFeedImport(
        name="legacy", url=url, insecure_since=insecure_since, last_error=last_error
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


def _client(requested: list[str]) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, content=RSS)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_a_plain_http_feed_is_flagged_on_first_poll_and_still_fetched(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed(db_async)
    assert feed.insecure_since is None
    requested: list[str] = []
    before = utc_now()
    async with _client(requested) as client:
        await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )
    assert feed.insecure_since is not None
    assert before <= feed.insecure_since <= utc_now()
    assert len(requested) == 1
    assert feed.last_error is None


async def test_the_flag_time_is_not_reset_by_later_polls(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    first_flag = utc_now() - timedelta(days=3)
    feed = await _feed(db_async, insecure_since=first_flag)
    requested: list[str] = []
    async with _client(requested) as client:
        for _ in range(2):
            await cap_service.ingest_feed(
                session=db_async, feed=feed, system_user=su, http_client=client
            )
    await db_async.refresh(feed)
    assert feed.insecure_since == first_flag
    assert len(requested) == 2


async def test_a_feed_inside_the_grace_period_is_fetched_on_day_13(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed(
        db_async, insecure_since=utc_now() - timedelta(days=13, hours=23)
    )
    requested: list[str] = []
    async with _client(requested) as client:
        await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )
    assert len(requested) == 1


async def test_a_feed_after_the_grace_period_is_skipped_logged_and_kept(
    db_async: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed(
        db_async, insecure_since=utc_now() - timedelta(days=14, minutes=1)
    )
    requested: list[str] = []
    cap_service.logger.disabled = False
    with caplog.at_level(logging.WARNING, logger=cap_service.logger.name):
        async with _client(requested) as client:
            result = await cap_service.ingest_feed(
                session=db_async, feed=feed, system_user=su, http_client=client
            )
    assert result == {"created": 0, "skipped": 0}
    assert requested == []
    assert feed.last_error == "plain http no longer allowed"
    assert any("grace period has ended" in r.getMessage() for r in caplog.records)
    await db_async.refresh(feed)
    assert feed.url == HTTP_FEED  # not deleted


async def test_an_https_feed_is_never_flagged(db_async: AsyncSession) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed(db_async, url=HTTPS_FEED)
    requested: list[str] = []
    async with _client(requested) as client:
        await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )
    assert feed.insecure_since is None
    assert len(requested) == 1


async def test_update_to_a_non_https_url_is_refused_and_https_clears_the_flag(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed(
        db_async, insecure_since=utc_now(), last_error="plain http no longer allowed"
    )
    with pytest.raises(CapFeedUrlError):
        await cap_service.update_feed(
            session=db_async,
            current_user=su,
            feed_id=feed.id,
            payload=CapFeedImportUpdate(url="http://other.example.org/cap.rss"),
        )
    with pytest.raises(CapFeedUrlError):
        await cap_service.update_feed(
            session=db_async,
            current_user=su,
            feed_id=feed.id,
            payload=CapFeedImportUpdate(url="https://other.example.org:8443/cap.rss"),
        )
    await db_async.refresh(feed)
    assert feed.url == HTTP_FEED

    fixed = await cap_service.update_feed(
        session=db_async,
        current_user=su,
        feed_id=feed.id,
        payload=CapFeedImportUpdate(url=HTTPS_FEED),
    )
    assert fixed.url == HTTPS_FEED
    assert fixed.insecure_since is None
    assert fixed.last_error is None


async def test_resending_the_stored_http_url_is_not_a_change(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    flagged = utc_now() - timedelta(days=2)
    feed = await _feed(db_async, insecure_since=flagged)
    updated = await cap_service.update_feed(
        session=db_async,
        current_user=su,
        feed_id=feed.id,
        payload=CapFeedImportUpdate(url=HTTP_FEED, name="renamed"),
    )
    assert updated.name == "renamed"
    assert updated.insecure_since == flagged


async def test_create_refuses_http(db_async: AsyncSession) -> None:
    su = await make_user(db_async, superuser=True)
    with pytest.raises(CapFeedUrlError) as info:
        await cap_service.create_feed(
            session=db_async,
            current_user=su,
            payload=CapFeedImportCreate(name="x", url=HTTP_FEED),
        )
    assert info.value.status_code == 422


async def test_the_api_shows_the_flag_and_the_end_of_the_grace(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    since = utc_now() - timedelta(days=2)
    await _feed(db_async, insecure_since=since)
    await _feed(db_async, url=HTTPS_FEED)
    expired = await _feed(
        db_async,
        url="http://old.example.org/cap.rss",
        insecure_since=utc_now() - timedelta(days=15),
    )
    response = await async_client.get(
        "/api/v1/cap/feeds", headers=superuser_token_headers_async
    )
    assert response.status_code == 200
    by_url = {row["url"]: row for row in response.json()}
    flagged = by_url[HTTP_FEED]
    assert flagged["insecure_since"].startswith(since.strftime("%Y-%m-%dT%H:%M"))
    assert flagged["grace_ends_at"].startswith(
        (since + timedelta(days=14)).strftime("%Y-%m-%dT%H:%M")
    )
    assert flagged["grace_expired"] is False
    assert by_url[HTTPS_FEED]["insecure_since"] is None
    assert by_url[HTTPS_FEED]["grace_ends_at"] is None
    assert by_url[HTTPS_FEED]["grace_expired"] is False
    assert by_url[expired.url]["grace_expired"] is True

    rejected = await async_client.post(
        "/api/v1/cap/feeds",
        headers=superuser_token_headers_async,
        json={"name": "x", "url": "https://feeds.example.org:8443/cap.rss"},
    )
    assert rejected.status_code == 422


# --- stale flags, URL variants and the guarded write -------------------------


@pytest.mark.parametrize(
    "variant",
    [
        "HTTP://legacy.example.org/cap.rss",  # scheme case
        "http://legacy.example.org/cap.rss ",  # trailing space
        "http://legacy.example.org/cap.rss/",  # trailing slash
    ],
)
async def test_http_url_variants_count_as_a_change_and_are_refused(
    db_async: AsyncSession, variant: str
) -> None:
    su = await make_user(db_async, superuser=True)
    flagged = utc_now() - timedelta(days=1)
    feed = await _feed(db_async, insecure_since=flagged)
    with pytest.raises(CapFeedUrlError):
        await cap_service.update_feed(
            session=db_async,
            current_user=su,
            feed_id=feed.id,
            payload=CapFeedImportUpdate(url=variant),
        )
    await db_async.refresh(feed)
    assert feed.url == HTTP_FEED
    assert feed.insecure_since == flagged


@pytest.mark.parametrize(
    "variant",
    [
        "HTTPS://legacy.example.org/cap.rss",
        "https://legacy.example.org/cap.rss/",
        " https://legacy.example.org/cap.rss",
    ],
)
async def test_https_url_variants_are_validated_as_a_change(
    db_async: AsyncSession, variant: str
) -> None:
    """Case and slash variants are accepted (and clear the flag); a space is refused."""
    su = await make_user(db_async, superuser=True)
    feed = await _feed(db_async, insecure_since=utc_now())
    if variant.startswith(" "):
        with pytest.raises(CapFeedUrlError):
            await cap_service.update_feed(
                session=db_async,
                current_user=su,
                feed_id=feed.id,
                payload=CapFeedImportUpdate(url=variant),
            )
        return
    updated = await cap_service.update_feed(
        session=db_async,
        current_user=su,
        feed_id=feed.id,
        payload=CapFeedImportUpdate(url=variant),
    )
    assert updated.insecure_since is None


async def test_a_status_toggle_and_a_rename_leave_the_flag_alone(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    flagged = utc_now() - timedelta(days=4)
    feed = await _feed(db_async, insecure_since=flagged)
    toggled = await cap_service.update_feed(
        session=db_async,
        current_user=su,
        feed_id=feed.id,
        payload=CapFeedImportUpdate(status=CapIntegrationStatus.INACTIVE),
    )
    assert toggled.insecure_since == flagged
    renamed = await cap_service.update_feed(
        session=db_async,
        current_user=su,
        feed_id=feed.id,
        payload=CapFeedImportUpdate(name="renamed"),
    )
    assert renamed.insecure_since == flagged
    assert renamed.url == HTTP_FEED


async def test_an_https_feed_with_a_stale_flag_is_reported_without_grace_fields(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    await _feed(db_async, url=HTTPS_FEED, insecure_since=utc_now() - timedelta(days=20))
    response = await async_client.get(
        "/api/v1/cap/feeds", headers=superuser_token_headers_async
    )
    assert response.status_code == 200
    row = next(r for r in response.json() if r["url"] == HTTPS_FEED)
    assert row["insecure_since"] is None
    assert row["grace_ends_at"] is None
    assert row["grace_expired"] is False


async def test_the_guarded_write_cannot_flag_a_feed_changed_to_https(
    db_async: AsyncSession,
) -> None:
    """The worker read the feed as http; staff then saved https; the late write is a no-op."""
    feed = await _feed(db_async)  # the worker's view: http, not flagged
    stale_url = feed.url
    await db_async.execute(
        sa.update(CapFeedImport)
        .where(CapFeedImport.id == feed.id)
        .values(url=HTTPS_FEED)
    )
    await db_async.commit()
    assert stale_url == HTTP_FEED
    flagged = await cap_service.flag_insecure_feed(
        session=db_async, feed=feed, now=utc_now()
    )
    assert flagged is False
    assert feed.url == HTTPS_FEED
    assert feed.insecure_since is None


async def test_the_guarded_write_flags_an_http_feed_once(
    db_async: AsyncSession,
) -> None:
    feed = await _feed(db_async)
    first = utc_now() - timedelta(days=1)
    assert await cap_service.flag_insecure_feed(session=db_async, feed=feed, now=first)
    assert feed.insecure_since == first
    assert not await cap_service.flag_insecure_feed(
        session=db_async, feed=feed, now=utc_now()
    )
    assert feed.insecure_since == first


async def test_a_stale_flag_on_an_https_feed_is_cleared_at_the_next_poll(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed(
        db_async, url=HTTPS_FEED, insecure_since=utc_now() - timedelta(days=20)
    )
    requested: list[str] = []
    async with _client(requested) as client:
        await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )
    await db_async.refresh(feed)
    assert feed.insecure_since is None
    assert len(requested) == 1  # fetched normally, not skipped as expired


# --- what counts as plain http is what the fetch would read -------------------

ODD_HTTP_URLS = [
    "\thttp://legacy.example.org/cap.rss",
    "\n http://legacy.example.org/cap.rss",
    "\x1fhttp://legacy.example.org/cap.rss",
    "HTTP://legacy.example.org/cap.rss",
    "hTtP://legacy.example.org/cap.rss",
]


@pytest.mark.parametrize("url", ODD_HTTP_URLS)
async def test_odd_spellings_of_http_are_flagged_once(
    db_async: AsyncSession, url: str
) -> None:
    feed = await _feed(db_async, url=url)
    first = utc_now() - timedelta(days=1)
    assert await cap_service.flag_insecure_feed(session=db_async, feed=feed, now=first)
    assert feed.insecure_since == first
    assert not await cap_service.flag_insecure_feed(
        session=db_async, feed=feed, now=utc_now()
    )
    assert feed.insecure_since == first


@pytest.mark.parametrize("url", ODD_HTTP_URLS)
async def test_odd_spellings_of_http_expire_like_any_other_http_feed(
    db_async: AsyncSession, url: str
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed(db_async, url=url, insecure_since=utc_now() - timedelta(days=15))
    requested: list[str] = []
    async with _client(requested) as client:
        result = await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )
    assert result == {"created": 0, "skipped": 0}
    assert requested == []
    assert feed.last_error == "plain http no longer allowed"
    assert feed.insecure_since is not None  # the flag is kept


@pytest.mark.parametrize("url", ODD_HTTP_URLS)
async def test_an_odd_http_spelling_is_flagged_by_the_first_poll(
    db_async: AsyncSession, url: str
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await _feed(db_async, url=url)
    async with _client([]) as client:
        await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )
    assert feed.insecure_since is not None
