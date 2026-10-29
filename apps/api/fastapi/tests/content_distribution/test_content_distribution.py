"""Social posting, dry run only: intake from the CMS, release, handlers and staff view.

No test reaches a real social network: SOCIAL_POSTING_LIVE stays false, and the
live-mode test only checks the refusal and the retry path.
"""

import uuid
from datetime import datetime, timedelta

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox

# Registers the social.post.* outbox handlers, as the worker does at drain time.
from src.content_distribution import (
    outbox_handlers,  # noqa: F401
    service,
)
from src.content_distribution.config import (
    content_distribution_settings as settings,
)
from src.content_distribution.models import ContentDelivery
from src.outbox import Outbox, OutboxStatus
from src.utils.datetime import utc_now

_URL = "/api/v1/content-distribution/internal/posts"
_STAFF_URL = "/api/v1/content-distribution/admin/posts"
_SECRET = "s" * 40
_PAST = "2026-10-01T09:00:00Z"
_FUTURE = "2099-01-01T09:00:00Z"


@pytest.fixture
def cms_secret(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setattr(settings, "CMS_DISTRIBUTION_SECRET", SecretStr(_SECRET))
    return {"X-CMS-Secret": _SECRET}


def _body(slug: str, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "collection": "stories",
        "slug": slug,
        "url": f"https://gms.example.test/stories/{slug}",
        "title": "Dry rain this week",
        "summary": "A quieter week ahead.",
        "captions": {
            "facebook": "Facebook copy",
            "instagram": "Instagram copy",
            "whatsapp": "WhatsApp copy",
        },
        "platforms": ["facebook", "instagram", "whatsapp"],
        "publishAt": _FUTURE,
        "imageUrl": "https://gms.example.test/images/week.png",
    }
    body.update(overrides)
    return body


async def _rows(db: AsyncSession, slug: str) -> list[ContentDelivery]:
    db.expire_all()
    return list(
        (
            await db.scalars(
                select(ContentDelivery)
                .where(ContentDelivery.slug == slug)
                .order_by(ContentDelivery.platform)
            )
        ).all()
    )


async def _set_publish_at(db: AsyncSession, slug: str, when: str) -> None:
    moment = datetime.fromisoformat(when.replace("Z", "+00:00")).replace(tzinfo=None)
    for row in await _rows(db, slug):
        row.publish_at = moment
    await db.commit()


# --- Intake route --------------------------------------------------------------


async def test_unset_secret_answers_503(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "CMS_DISTRIBUTION_SECRET", None)
    resp = await async_client.post(
        _URL, json=_body("unset-secret"), headers={"X-CMS-Secret": _SECRET}
    )
    assert resp.status_code == 503


async def test_short_secret_is_treated_as_unset(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "CMS_DISTRIBUTION_SECRET", SecretStr("short"))
    resp = await async_client.post(
        _URL, json=_body("short-secret"), headers={"X-CMS-Secret": "short"}
    )
    assert resp.status_code == 503


@pytest.mark.usefixtures("cms_secret")
async def test_wrong_or_missing_secret_answers_401(
    async_client: httpx.AsyncClient,
) -> None:
    missing = await async_client.post(_URL, json=_body("no-header"))
    wrong = await async_client.post(
        _URL, json=_body("wrong-secret"), headers={"X-CMS-Secret": "t" * 40}
    )
    assert missing.status_code == 401
    assert wrong.status_code == 401


async def test_valid_post_creates_one_row_per_platform(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    resp = await async_client.post(_URL, json=_body("first-post"), headers=cms_secret)
    assert resp.status_code == 202
    assert [d["outcome"] for d in resp.json()["deliveries"]] == ["created"] * 3
    rows = await _rows(db_async, "first-post")
    assert [r.dedupe_key for r in rows] == [
        "cms:stories:first-post:facebook",
        "cms:stories:first-post:instagram",
        "cms:stories:first-post:whatsapp",
    ]
    assert {r.status for r in rows} == {"pending"}
    assert rows[0].payload["caption"] == "Facebook copy"
    assert rows[0].payload["imageUrl"] == "https://gms.example.test/images/week.png"


async def test_resaving_a_pending_post_updates_it_and_never_duplicates(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    await async_client.post(_URL, json=_body("resave"), headers=cms_secret)
    resp = await async_client.post(
        _URL,
        json=_body("resave", title="Corrected title"),
        headers=cms_secret,
    )
    assert resp.status_code == 202
    assert [d["outcome"] for d in resp.json()["deliveries"]] == ["updated"] * 3
    rows = await _rows(db_async, "resave")
    assert len(rows) == 3
    assert {r.title for r in rows} == {"Corrected title"}


async def test_resaving_a_sent_post_never_changes_or_reposts(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    await async_client.post(
        _URL, json=_body("sent-once", platforms=["facebook"]), headers=cms_secret
    )
    await _set_publish_at(db_async, "sent-once", _PAST)
    await service.release_due(db_async, now=datetime(2026, 10, 2))
    await db_async.commit()
    await outbox.drain(
        db_async, only_topics=["social.post.facebook"], now=datetime(2026, 10, 2)
    )
    [row] = await _rows(db_async, "sent-once")
    assert row.status == "dry_run_sent"

    resp = await async_client.post(
        _URL,
        json=_body("sent-once", platforms=["facebook"], title="Edited later"),
        headers=cms_secret,
    )
    assert resp.json()["deliveries"][0]["outcome"] == "unchanged"
    [row] = await _rows(db_async, "sent-once")
    assert row.status == "dry_run_sent"
    assert row.title == "Dry rain this week"


@pytest.mark.parametrize(
    ("overrides", "reason"),
    [
        ({"collection": "cap-warnings"}, "warning"),
        ({"collection": "alerts"}, "warning"),
        ({"url": "https://gms.example.test/alerts/abc-123"}, "warning"),
        ({"url": "https://gms.example.test/warnings/abc-123"}, "warning"),
        ({"platforms": ["instagram"], "imageUrl": None}, "image"),
        ({"platforms": ["facebook"], "captions": {"instagram": "x"}}, "caption"),
        ({"platforms": ["tiktok"]}, None),
        ({"platforms": []}, None),
        ({"slug": "Bad Slug"}, None),
        ({"url": "http://plain.example.test/x"}, None),
    ],
)
async def test_refused_posts_answer_422_with_a_reason(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    overrides: dict[str, object],
    reason: str | None,
) -> None:
    slug = f"refused-{uuid.uuid4().hex[:8]}"
    body = _body(slug)
    body.update(overrides)
    resp = await async_client.post(_URL, json=body, headers=cms_secret)
    assert resp.status_code == 422
    if reason == "warning":
        assert "warning" in resp.text.lower()
    if reason == "image":
        assert "image" in resp.text.lower()
    if reason == "caption":
        assert "caption" in resp.text.lower()
    assert await _rows(db_async, slug) == []


async def test_whatsapp_is_stored_but_never_released(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    await async_client.post(
        _URL, json=_body("manual-only", platforms=["whatsapp"]), headers=cms_secret
    )
    await _set_publish_at(db_async, "manual-only", _PAST)
    released = await service.release_due(db_async, now=datetime(2026, 10, 2))
    assert released == 0
    [row] = await _rows(db_async, "manual-only")
    assert row.status == "pending"
    assert row.payload["caption"] == "WhatsApp copy"


# --- Release and dry-run handlers -----------------------------------------------


async def test_release_queues_only_due_automated_rows(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    await async_client.post(
        _URL, json=_body("due-now", platforms=["facebook"]), headers=cms_secret
    )
    await async_client.post(
        _URL,
        json=_body("due-later", platforms=["facebook"]),
        headers=cms_secret,
    )
    await _set_publish_at(db_async, "due-now", _PAST)

    released = await service.release_due(db_async, now=datetime(2026, 10, 2))
    await db_async.commit()

    assert released == 1
    # Column reads, not ORM objects: a later query expires ORM objects, and an
    # expired attribute cannot be loaded outside the async session.
    now_status = await db_async.scalar(
        select(ContentDelivery.status).where(ContentDelivery.slug == "due-now")
    )
    later_status = await db_async.scalar(
        select(ContentDelivery.status).where(ContentDelivery.slug == "due-later")
    )
    assert now_status == "scheduled"
    assert later_status == "pending"
    queued = await db_async.scalar(
        select(Outbox.topic).where(Outbox.dedupe_key == "cms:stories:due-now:facebook")
    )
    assert queued == "social.post.facebook"


async def test_dry_run_handler_records_what_would_be_posted(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    await async_client.post(
        _URL,
        json=_body("dry-run", platforms=["facebook", "instagram"]),
        headers=cms_secret,
    )
    await _set_publish_at(db_async, "dry-run", _PAST)
    await service.release_due(db_async, now=datetime(2026, 10, 2))
    await db_async.commit()

    finished = await outbox.drain(
        db_async,
        only_topics=["social.post.facebook", "social.post.instagram"],
        now=datetime(2026, 10, 2),
    )
    assert finished == 2
    rows = await _rows(db_async, "dry-run")
    assert {r.status for r in rows} == {"dry_run_sent"}
    assert all(r.external_id and r.external_id.startswith("dry-run:") for r in rows)
    assert all(r.processed_at is not None for r in rows)
    facebook = next(r for r in rows if r.platform == "facebook")
    assert facebook.payload["caption"] == "Facebook copy"


async def test_drain_twice_never_posts_twice(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    await async_client.post(
        _URL, json=_body("twice", platforms=["facebook"]), headers=cms_secret
    )
    await _set_publish_at(db_async, "twice", _PAST)
    await service.release_due(db_async, now=datetime(2026, 10, 2))
    await db_async.commit()
    await outbox.drain(
        db_async, only_topics=["social.post.facebook"], now=datetime(2026, 10, 2)
    )
    external = await db_async.scalar(
        select(ContentDelivery.external_id).where(ContentDelivery.slug == "twice")
    )
    # A second release and drain finds nothing to do and changes nothing.
    assert await service.release_due(db_async, now=datetime(2026, 10, 3)) == 0
    assert (
        await outbox.drain(
            db_async, only_topics=["social.post.facebook"], now=datetime(2026, 10, 3)
        )
        == 0
    )
    [row] = await _rows(db_async, "twice")
    assert row.external_id == external
    assert row.status == "dry_run_sent"


async def test_live_mode_refuses_then_dies_and_records_the_error(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "SOCIAL_POSTING_LIVE", True)
    await async_client.post(
        _URL, json=_body("live-refused", platforms=["facebook"]), headers=cms_secret
    )
    await _set_publish_at(db_async, "live-refused", _PAST)
    await service.release_due(db_async, now=datetime(2026, 10, 2))
    await db_async.commit()

    now = datetime(2026, 10, 2)
    for attempt in range(outbox.MAX_ATTEMPTS):
        await outbox.drain(
            db_async,
            only_topics=["social.post.facebook"],
            now=now + timedelta(days=attempt),
        )
    [row] = await _rows(db_async, "live-refused")
    assert row.status == "dead"
    assert row.error is not None
    assert "not configured" in row.error.lower()
    outbox_row = await db_async.scalar(
        select(Outbox).where(Outbox.dedupe_key == row.dedupe_key)
    )
    assert outbox_row is not None
    assert outbox_row.status == OutboxStatus.DEAD.value


# --- Staff view ----------------------------------------------------------------


async def test_staff_list_needs_the_social_permission(
    async_client: httpx.AsyncClient, normal_user_token_headers_async: dict[str, str]
) -> None:
    resp = await async_client.get(_STAFF_URL, headers=normal_user_token_headers_async)
    assert resp.status_code == 403


async def test_staff_list_shows_status_and_retrying_as_failed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    superuser_token_headers_async: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "SOCIAL_POSTING_LIVE", True)
    await async_client.post(
        _URL,
        json=_body("staff-view", platforms=["facebook", "whatsapp"]),
        headers=cms_secret,
    )
    await _set_publish_at(db_async, "staff-view", _PAST)
    await service.release_due(db_async, now=datetime(2026, 10, 2))
    await db_async.commit()
    # One failed attempt: the outbox keeps the row for a retry.
    await outbox.drain(
        db_async, only_topics=["social.post.facebook"], now=datetime(2026, 10, 2)
    )

    resp = await async_client.get(
        _STAFF_URL, params={"slug": "staff-view"}, headers=superuser_token_headers_async
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    by_platform = {item["platform"]: item for item in body["data"]}
    assert by_platform["facebook"]["status"] == "failed"
    assert "SocialPostingNotConfigured" in (by_platform["facebook"]["error"] or "")
    assert by_platform["whatsapp"]["status"] == "pending"
    assert by_platform["whatsapp"]["automated"] is False
    assert by_platform["facebook"]["automated"] is True
    assert (
        by_platform["facebook"]["url"] == "https://gms.example.test/stories/staff-view"
    )


async def test_publish_at_is_stored_as_naive_utc(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    await async_client.post(
        _URL,
        json=_body(
            "utc-time", platforms=["facebook"], publishAt="2026-10-30T07:30:00-04:00"
        ),
        headers=cms_secret,
    )
    [row] = await _rows(db_async, "utc-time")
    assert row.publish_at == datetime(2026, 10, 30, 11, 30)
    assert row.publish_at.tzinfo is None


# --- What the CMS really sends ---------------------------------------------------


def _cms_body(**overrides: object) -> dict[str, object]:
    """Mirrors distributionBody() in apps/web/cms/src/lib/social-distribution.ts for
    a dated story: the slug keeps its slashes, publishAt is null when the editor
    leaves "publish at" empty, captions for unchosen platforms are null, and the
    image is null when there is none."""
    body: dict[str, object] = {
        "collection": "stories",
        "slug": "stories/2026/10/dry-rain-this-week",
        "url": "https://gms.example.test/explore/news/2026/10/dry-rain-this-week",
        "title": "Dry rain this week",
        "summary": "",
        "captions": {
            "facebook": "Facebook copy",
            "instagram": None,
            "whatsapp": "WhatsApp copy",
        },
        "platforms": ["facebook", "whatsapp"],
        "publishAt": None,
        "imageUrl": None,
    }
    body.update(overrides)
    return body


async def test_cms_body_with_a_dated_slug_and_no_publish_time_is_accepted(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    slug = "stories/2026/10/dry-rain-this-week"
    resp = await async_client.post(_URL, json=_cms_body(), headers=cms_secret)
    assert resp.status_code == 202, resp.text
    assert [d["outcome"] for d in resp.json()["deliveries"]] == ["created", "created"]
    rows = await _rows(db_async, slug)
    assert [r.dedupe_key for r in rows] == [
        f"cms:stories:{slug}:facebook",
        f"cms:stories:{slug}:whatsapp",
    ]

    # Re-saving the same post updates it; it never duplicates.
    again = await async_client.post(_URL, json=_cms_body(), headers=cms_secret)
    assert [d["outcome"] for d in again.json()["deliveries"]] == ["updated"] * 2
    assert len(await _rows(db_async, slug)) == 2


@pytest.mark.parametrize(
    "slug",
    [
        "stories//double-slash",
        "/stories/leading-slash",
        "stories/trailing-slash/",
        "stories/../escape",
        "stories/-leading-hyphen",
        "stories/Upper/case",
        "stories/with space",
    ],
)
async def test_slugs_with_empty_dotted_or_odd_segments_are_refused(
    async_client: httpx.AsyncClient,
    cms_secret: dict[str, str],
    slug: str,
) -> None:
    resp = await async_client.post(_URL, json=_cms_body(slug=slug), headers=cms_secret)
    assert resp.status_code == 422


async def test_the_longest_legal_post_fits_the_dedupe_column(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
) -> None:
    collection = "c" + "x" * 59  # the 60-character limit
    slug = "stories/" + "a" * 192  # the 200-character limit
    column_length = ContentDelivery.__table__.c.dedupe_key.type.length
    longest_key = service.dedupe_key(collection, slug, "whatsapp")
    assert len(longest_key) <= column_length

    body = _cms_body(
        collection=collection,
        slug=slug,
        url=f"https://gms.example.test/explore/news/{'a' * 192}",
        platforms=["whatsapp"],
    )
    resp = await async_client.post(_URL, json=body, headers=cms_secret)
    assert resp.status_code == 202, resp.text
    [row] = await _rows(db_async, slug)
    assert row.dedupe_key == longest_key


async def test_staff_list_filters_by_a_dated_slug(
    async_client: httpx.AsyncClient,
    cms_secret: dict[str, str],
    superuser_token_headers_async: dict[str, str],
) -> None:
    slug = "stories/2026/10/staff-filter"
    await async_client.post(_URL, json=_cms_body(slug=slug), headers=cms_secret)
    resp = await async_client.get(
        _STAFF_URL, params={"slug": slug}, headers=superuser_token_headers_async
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["count"] == 2
    assert {row["slug"] for row in resp.json()["data"]} == {slug}


@pytest.mark.parametrize("omit_key", [False, True], ids=["null", "missing"])
async def test_no_publish_time_means_now_so_the_post_is_due_at_once(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    omit_key: bool,
) -> None:
    slug = f"manual-now-{'missing' if omit_key else 'null'}"
    body = _body(slug, platforms=["facebook"], publishAt=None)
    if omit_key:
        del body["publishAt"]
    before = utc_now()
    resp = await async_client.post(_URL, json=body, headers=cms_secret)
    after = utc_now()
    assert resp.status_code == 202, resp.text

    [row] = await _rows(db_async, slug)
    assert before <= row.publish_at <= after
    assert row.publish_at.tzinfo is None

    # Due as soon as the next release runs: the post reaches the outbox and then
    # the dry-run handler, with no wait for a publish time.
    later = after + timedelta(seconds=1)
    assert await service.release_due(db_async, now=later) == 1
    await db_async.commit()
    await outbox.drain(db_async, only_topics=["social.post.facebook"], now=later)
    [row] = await _rows(db_async, slug)
    assert row.status == "dry_run_sent"
