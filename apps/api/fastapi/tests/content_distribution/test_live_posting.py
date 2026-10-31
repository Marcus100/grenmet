"""Live posting to Facebook and Instagram, end to end through the real outbox.

Intake, release, the outbox drain and the database are real. Meta is answered by
``FakeMeta`` (an httpx.MockTransport), so no test reaches a network. Scenarios cover
the switch (feature flag and credentials), the publish paths, retries, rejections,
the unknown outcome that must never be sent twice, and the staff view. Each run
also checks that the token never reaches a log line, a stored reason or a URL.
"""

import logging
from collections.abc import Callable, Iterator
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.content_distribution import meta_graph, service
from src.content_distribution.config import (
    content_distribution_settings as settings,
)
from src.content_distribution.constants import (
    ERROR_OUTCOME_UNKNOWN,
    REASON_FLAG_OFF,
    REASON_NO_IMAGE,
    REASON_NOT_CONFIGURED,
    REASON_TOKEN_MALFORMED,
    SOCIAL_LIVE_FLAG,
)
from src.content_distribution.models import ContentDelivery
from src.content_distribution.outbox_handlers import post_facebook, post_instagram
from src.feature_flags import service as flag_service
from src.feature_flags.models import FeatureFlag
from src.outbox import Outbox

_URL = "/api/v1/content-distribution/internal/posts"
_STAFF_URL = "/api/v1/content-distribution/admin/posts"
_SECRET = "s" * 40
TOKEN = "EAAB-live-test-token-never-log-me"
PAGE_ID = "1234567890"
IG_ID = "17841400000001"
FB_POST = f"{PAGE_ID}_555000111"
IMAGE = "https://gms.example.test/images/week.jpg"
TOPIC_FB = "social.post.facebook"
TOPIC_IG = "social.post.instagram"
DUE = datetime(2026, 10, 2, 9)
MAX_ATTEMPTS = outbox.MAX_ATTEMPTS

Answer = Callable[[httpx.Request], httpx.Response]


def test_the_post_handlers_are_registered_with_the_outbox() -> None:
    # Importing the module registers both topics; the worker relies on that.
    assert post_facebook is not None and post_instagram is not None
    assert {TOPIC_FB, TOPIC_IG} <= set(outbox.registered_topics())


def _unconfigured(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        418, json={"error": {"code": 1, "message": "no answer set for this test"}}
    )


class FakeMeta:
    """Records every request the worker makes to Meta and answers with ``answer``."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.waits: list[float] = []
        self.answer: Answer = _unconfigured

    def _respond(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.answer(request)

    async def sleep(self, seconds: float) -> None:
        self.waits.append(seconds)


@pytest.fixture(autouse=True)
def _fresh_flag_cache() -> Iterator[None]:
    flag_service.clear_cache()
    yield
    flag_service.clear_cache()


@pytest.fixture
def cms_secret(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setattr(settings, "CMS_DISTRIBUTION_SECRET", SecretStr(_SECRET))
    monkeypatch.setattr(settings, "SOCIAL_LINK_HOSTS", "gms.example.test")
    monkeypatch.setattr(settings, "SOCIAL_IMAGE_HOSTS", "gms.example.test")
    return {"X-CMS-Secret": _SECRET}


@pytest.fixture
def fake_meta(monkeypatch: pytest.MonkeyPatch) -> FakeMeta:
    meta = FakeMeta()
    monkeypatch.setattr(meta_graph, "_transport", httpx.MockTransport(meta._respond))
    monkeypatch.setattr(meta_graph, "_sleep", meta.sleep)
    return meta


@pytest.fixture(autouse=True)
def meta_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "META_PAGE_ID", PAGE_ID)
    monkeypatch.setattr(settings, "META_INSTAGRAM_ACCOUNT_ID", IG_ID)
    monkeypatch.setattr(settings, "META_PAGE_ACCESS_TOKEN", SecretStr(TOKEN))


async def _switch_live_on(db: AsyncSession) -> None:
    db.add(FeatureFlag(key=SOCIAL_LIVE_FLAG, enabled=True, audience={"everyone": True}))
    await db.commit()
    flag_service.clear_cache()


def _body(slug: str, platforms: list[str], *, image: bool = True) -> dict[str, Any]:
    return {
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
        "platforms": platforms,
        "publishAt": None,
        "imageUrl": IMAGE if image else None,
    }


async def _intake_and_release(
    async_client: httpx.AsyncClient,
    db: AsyncSession,
    cms_secret: dict[str, str],
    slug: str,
    platforms: list[str],
    *,
    image: bool = True,
) -> None:
    resp = await async_client.post(
        _URL, json=_body(slug, platforms, image=image), headers=cms_secret
    )
    assert resp.status_code == 202, resp.text
    for row in await _rows(db, slug):
        row.publish_at = datetime(2026, 10, 1, 9)
    await db.commit()
    await service.release_due(db, now=DUE)
    await db.commit()


async def _drain(db: AsyncSession, topic: str, *, day: int = 0) -> int:
    return await outbox.drain(db, only_topics=[topic], now=DUE + timedelta(days=day))


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


async def _one(db: AsyncSession, slug: str, platform: str) -> ContentDelivery:
    [row] = [r for r in await _rows(db, slug) if r.platform == platform]
    return row


async def _outbox_status(db: AsyncSession, slug: str, platform: str) -> str | None:
    return await db.scalar(
        select(Outbox.status).where(
            Outbox.dedupe_key == f"cms:stories:{slug}:{platform}"
        )
    )


def _answer_with(
    *answers: httpx.Response | Exception,
) -> Answer:
    """Answers in order; the last one repeats. Exceptions are raised, like a dropped link."""
    queue = list(answers)

    def respond(_request: httpx.Request) -> httpx.Response:
        reply = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(reply, Exception):
            raise reply
        return reply

    return respond


def _ok(body: dict[str, Any]) -> httpx.Response:
    return httpx.Response(200, json=body)


def _form(request: httpx.Request) -> dict[str, list[str]]:
    return parse_qs(request.content.decode())


# --- The switch: flag and credentials ------------------------------------------


async def test_flag_off_is_a_dry_run_that_says_why(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _intake_and_release(
        async_client, db_async, cms_secret, "flag-off", ["facebook"]
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    row = await _one(db_async, "flag-off", "facebook")
    assert row.status == "dry_run_sent"
    assert row.reason == REASON_FLAG_OFF
    assert row.external_id == f"dry-run:{row.id}"
    assert row.error is None
    assert fake_meta.requests == []


@pytest.mark.parametrize(
    ("platform", "setting"),
    [
        ("facebook", "META_PAGE_ID"),
        ("facebook", "META_PAGE_ACCESS_TOKEN"),
        ("instagram", "META_INSTAGRAM_ACCOUNT_ID"),
        ("instagram", "META_PAGE_ACCESS_TOKEN"),
    ],
)
async def test_flag_on_without_its_settings_is_a_dry_run_that_says_not_configured(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    monkeypatch: pytest.MonkeyPatch,
    platform: str,
    setting: str,
) -> None:
    monkeypatch.setattr(settings, setting, None)
    await _switch_live_on(db_async)
    slug = f"not-configured-{platform}-{setting.lower().replace('_', '-')}"
    await _intake_and_release(async_client, db_async, cms_secret, slug, [platform])
    assert await _drain(db_async, f"social.post.{platform}") == 1
    row = await _one(db_async, slug, platform)
    assert row.status == "dry_run_sent"
    assert row.reason == REASON_NOT_CONFIGURED
    assert fake_meta.requests == []


# --- Publishing -------------------------------------------------------------------


async def test_facebook_link_post_is_published_once(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(_ok({"id": FB_POST}))
    await _intake_and_release(
        async_client, db_async, cms_secret, "fb-link", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1

    [request] = fake_meta.requests
    assert request.method == "POST"
    assert request.url.path == f"/v24.0/{PAGE_ID}/feed"
    assert _form(request)["message"] == ["Facebook copy"]
    assert _form(request)["link"] == ["https://gms.example.test/stories/fb-link"]
    assert request.headers["Authorization"] == f"Bearer {TOKEN}"
    assert TOKEN not in str(request.url)

    row = await _one(db_async, "fb-link", "facebook")
    assert row.status == "posted"
    assert row.external_id == FB_POST
    assert row.reason is None
    assert row.error is None
    assert row.attempts == 1
    assert row.processed_at is not None
    assert await _outbox_status(db_async, "fb-link", "facebook") == "done"


async def test_facebook_photo_post_when_the_content_has_an_image(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(_ok({"id": "photo-7", "post_id": FB_POST}))
    await _intake_and_release(
        async_client, db_async, cms_secret, "fb-photo", ["facebook"]
    )
    assert await _drain(db_async, TOPIC_FB) == 1

    [request] = fake_meta.requests
    assert request.url.path == f"/v24.0/{PAGE_ID}/photos"
    form = _form(request)
    assert form["url"] == [IMAGE]
    assert form["published"] == ["true"]
    assert form["message"] == [
        "Facebook copy\n\nhttps://gms.example.test/stories/fb-photo"
    ]
    row = await _one(db_async, "fb-photo", "facebook")
    assert row.status == "posted"
    assert row.external_id == FB_POST


async def test_instagram_creates_a_container_then_publishes_it(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)

    def answer(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return _ok({"status_code": "FINISHED"})
        if request.url.path.endswith("/media_publish"):
            return _ok({"id": "17900000000000001"})
        return _ok({"id": "5001"})

    fake_meta.answer = answer
    await _intake_and_release(
        async_client, db_async, cms_secret, "ig-photo", ["instagram"]
    )
    assert await _drain(db_async, TOPIC_IG) == 1

    assert [f"{r.method} {r.url.path}" for r in fake_meta.requests] == [
        f"POST /v24.0/{IG_ID}/media",
        "GET /v24.0/5001",
        f"POST /v24.0/{IG_ID}/media_publish",
    ]
    assert _form(fake_meta.requests[0])["image_url"] == [IMAGE]
    assert _form(fake_meta.requests[2])["creation_id"] == ["5001"]
    row = await _one(db_async, "ig-photo", "instagram")
    assert row.status == "posted"
    assert row.external_id == "17900000000000001"


async def test_instagram_without_an_image_is_skipped_with_the_reason(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    # Intake refuses an Instagram post without an image, so this row is set up
    # directly: the handler is the last line of defence and must skip, not post.
    await _switch_live_on(db_async)
    await _intake_and_release(
        async_client, db_async, cms_secret, "ig-no-image", ["instagram"]
    )
    [row] = await _rows(db_async, "ig-no-image")
    row.payload = {**row.payload, "imageUrl": None}
    await db_async.commit()

    assert await _drain(db_async, TOPIC_IG) == 1
    row = await _one(db_async, "ig-no-image", "instagram")
    assert row.status == "skipped"
    assert row.reason == REASON_NO_IMAGE
    assert row.external_id is None
    assert fake_meta.requests == []


# --- Retries and rejections ------------------------------------------------------


async def test_a_busy_meta_is_retried_after_retry_after_and_then_posts(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(
        httpx.Response(429, headers={"Retry-After": "7"}),
        _ok({"id": FB_POST}),
    )
    await _intake_and_release(
        async_client, db_async, cms_secret, "busy-then-ok", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    assert len(fake_meta.requests) == 2
    assert fake_meta.waits == [7.0]
    row = await _one(db_async, "busy-then-ok", "facebook")
    assert row.status == "posted"
    assert row.external_id == FB_POST


async def test_a_client_error_fails_for_good_with_the_reason_and_is_not_retried(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(
        httpx.Response(
            400, json={"error": {"code": 100, "message": "Invalid parameter"}}
        )
    )
    await _intake_and_release(
        async_client, db_async, cms_secret, "rejected", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    assert await _drain(db_async, TOPIC_FB, day=3) == 0

    row = await _one(db_async, "rejected", "facebook")
    assert row.status == "dead"
    assert row.error is not None
    assert "error code 100" in row.error
    assert "Invalid parameter" in row.error
    assert len(fake_meta.requests) == 1


async def test_a_busy_meta_that_never_recovers_ends_dead_with_the_reason(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(httpx.Response(429))
    await _intake_and_release(
        async_client, db_async, cms_secret, "always-busy", ["facebook"], image=False
    )
    for day in range(MAX_ATTEMPTS):
        await _drain(db_async, TOPIC_FB, day=day)
        row = await _one(db_async, "always-busy", "facebook")
        if day < MAX_ATTEMPTS - 1:
            # Between attempts the row stays scheduled, with no in-flight marker, so
            # the next attempt may send it.
            assert row.status == "scheduled"
            assert row.publish_started_at is None
            assert row.error == "Meta is busy (HTTP 429)"

    row = await _one(db_async, "always-busy", "facebook")
    assert row.status == "dead"
    assert row.error == "Meta is busy (HTTP 429)"
    # Each attempt makes three calls inside itself before the outbox retries.
    assert len(fake_meta.requests) == 3 * MAX_ATTEMPTS


async def test_a_connection_that_never_opened_is_retried_inside_the_call(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(
        httpx.ConnectError("connection refused"), _ok({"id": FB_POST})
    )
    await _intake_and_release(
        async_client, db_async, cms_secret, "connect-retry", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    row = await _one(db_async, "connect-retry", "facebook")
    assert row.status == "posted"
    assert len(fake_meta.requests) == 2


async def test_a_retryable_failure_is_sent_once_when_the_outbox_tries_again(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(
        *[httpx.Response(429) for _ in range(3)], _ok({"id": FB_POST})
    )
    await _intake_and_release(
        async_client, db_async, cms_secret, "retry-once", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB, day=0) == 0
    assert (await _one(db_async, "retry-once", "facebook")).status == "scheduled"

    assert await _drain(db_async, TOPIC_FB, day=1) == 1
    row = await _one(db_async, "retry-once", "facebook")
    assert row.status == "posted"
    posts = [r for r in fake_meta.requests if r.method == "POST"]
    assert len(posts) == 4  # three busy answers, then the one that published
    assert row.external_id == FB_POST


# --- At most once --------------------------------------------------------------


async def test_a_lost_answer_after_the_publish_request_is_never_sent_again(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(httpx.ReadTimeout("no answer from Meta"))
    await _intake_and_release(
        async_client, db_async, cms_secret, "lost-answer", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    assert await _drain(db_async, TOPIC_FB, day=5) == 0

    row = await _one(db_async, "lost-answer", "facebook")
    assert row.status == "dead"
    assert row.error == ERROR_OUTCOME_UNKNOWN
    assert row.external_id is None
    assert row.publish_started_at is not None
    assert len(fake_meta.requests) == 1


async def test_a_server_error_on_the_publish_call_is_unknown_and_sent_once(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    # Meta may have accepted the post before the server failed, so it is not retried:
    # one request, an unknown outcome, and the editor checks the page.
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(httpx.Response(500))
    await _intake_and_release(
        async_client,
        db_async,
        cms_secret,
        "server-error-publish",
        ["facebook"],
        image=False,
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    assert await _drain(db_async, TOPIC_FB, day=5) == 0
    row = await _one(db_async, "server-error-publish", "facebook")
    assert row.status == "dead"
    assert row.error == ERROR_OUTCOME_UNKNOWN
    assert len(fake_meta.requests) == 1


async def test_an_unreadable_publish_answer_is_unknown_not_retried(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(httpx.Response(200, text="<html>oops</html>"))
    await _intake_and_release(
        async_client, db_async, cms_secret, "unreadable", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    row = await _one(db_async, "unreadable", "facebook")
    assert row.status == "dead"
    assert row.error == ERROR_OUTCOME_UNKNOWN
    assert len(fake_meta.requests) == 1


async def test_an_attempt_that_crashed_after_sending_is_given_up_not_sent_again(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    # The earlier attempt committed its in-flight marker, then the worker died before
    # Meta's answer was written down. The retry must not send the post again.
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(_ok({"id": FB_POST}))
    await _intake_and_release(
        async_client, db_async, cms_secret, "crashed", ["facebook"], image=False
    )
    row = await _one(db_async, "crashed", "facebook")
    row.publish_started_at = datetime(2026, 10, 2, 8, 59)
    await db_async.commit()

    assert await _drain(db_async, TOPIC_FB) == 1
    row = await _one(db_async, "crashed", "facebook")
    assert row.status == "dead"
    assert row.error == ERROR_OUTCOME_UNKNOWN
    assert fake_meta.requests == []


async def test_a_posted_row_is_never_posted_again(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(_ok({"id": FB_POST}))
    await _intake_and_release(
        async_client, db_async, cms_secret, "posted-once", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    # The outbox may deliver the same message again (at-least-once): nothing happens.
    await outbox.enqueue(
        db_async,
        topic=TOPIC_FB,
        payload={
            "delivery_id": str((await _one(db_async, "posted-once", "facebook")).id)
        },
        dedupe_key="cms:stories:posted-once:facebook:replay",
        run_at=DUE,
    )
    await db_async.commit()
    assert await _drain(db_async, TOPIC_FB, day=1) == 1
    assert len(fake_meta.requests) == 1
    row = await _one(db_async, "posted-once", "facebook")
    assert row.status == "posted"
    assert row.external_id == FB_POST


# --- Secrets ---------------------------------------------------------------------


async def test_a_token_that_is_not_one_value_is_a_dry_run_that_says_so(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _switch_live_on(db_async)
    monkeypatch.setattr(
        settings, "META_PAGE_ACCESS_TOKEN", SecretStr("EAAB first half\nsecond half")
    )
    await _intake_and_release(
        async_client, db_async, cms_secret, "malformed-token", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    row = await _one(db_async, "malformed-token", "facebook")
    assert row.status == "dry_run_sent"
    assert row.reason == REASON_TOKEN_MALFORMED
    # The reason never shows the token.
    assert "EAAB" not in (row.reason or "")
    assert fake_meta.requests == []


async def test_a_token_pasted_with_surrounding_whitespace_is_stripped_before_use(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _switch_live_on(db_async)
    monkeypatch.setattr(settings, "META_PAGE_ACCESS_TOKEN", SecretStr(f"  {TOKEN}\n"))
    fake_meta.answer = _answer_with(_ok({"id": FB_POST}))
    await _intake_and_release(
        async_client, db_async, cms_secret, "padded-token", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    [request] = fake_meta.requests
    assert request.headers["Authorization"] == f"Bearer {TOKEN}"
    assert (await _one(db_async, "padded-token", "facebook")).status == "posted"


async def test_the_token_never_reaches_logs_stored_reasons_or_the_url(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _switch_live_on(db_async)
    caplog.set_level(logging.DEBUG)
    # Meta is made to echo the token back in its error text. It must be redacted.
    fake_meta.answer = _answer_with(
        httpx.Response(
            400,
            json={"error": {"code": 190, "message": f"Invalid token {TOKEN}"}},
        )
    )
    await _intake_and_release(
        async_client, db_async, cms_secret, "no-secret", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1

    row = await _one(db_async, "no-secret", "facebook")
    assert row.error is not None
    assert "[redacted]" in row.error
    assert TOKEN not in (row.error or "")
    assert TOKEN not in (row.reason or "")
    stored = await db_async.scalar(
        select(Outbox.last_error).where(
            Outbox.dedupe_key == "cms:stories:no-secret:facebook"
        )
    )
    assert TOKEN not in (stored or "")
    assert TOKEN not in caplog.text
    assert all(TOKEN not in str(r.url) for r in fake_meta.requests)


async def test_the_token_never_reaches_logs_on_a_successful_post(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _switch_live_on(db_async)
    caplog.set_level(logging.DEBUG)
    fake_meta.answer = _answer_with(_ok({"id": FB_POST}))
    await _intake_and_release(
        async_client, db_async, cms_secret, "quiet-success", ["facebook"], image=False
    )
    assert await _drain(db_async, TOPIC_FB) == 1
    assert TOKEN not in caplog.text
    assert FB_POST not in caplog.text  # ids stay out of the logs too


# --- Staff view ------------------------------------------------------------------


async def test_the_staff_list_shows_posted_skipped_and_dead_with_their_reasons(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _switch_live_on(db_async)

    fake_meta.answer = _answer_with(_ok({"id": FB_POST}))
    await _intake_and_release(
        async_client, db_async, cms_secret, "staff-posted", ["facebook"], image=False
    )
    await _drain(db_async, TOPIC_FB)

    fake_meta.answer = _answer_with(
        httpx.Response(
            400, json={"error": {"code": 100, "message": "Invalid parameter"}}
        )
    )
    await _intake_and_release(
        async_client, db_async, cms_secret, "staff-dead", ["facebook"], image=False
    )
    await _drain(db_async, TOPIC_FB)

    await _intake_and_release(
        async_client, db_async, cms_secret, "staff-skipped", ["instagram"]
    )
    [row] = await _rows(db_async, "staff-skipped")
    row.payload = {**row.payload, "imageUrl": None}
    await db_async.commit()
    await _drain(db_async, TOPIC_IG)

    resp = await async_client.get(
        _STAFF_URL,
        params={"collection": "stories"},
        headers=superuser_token_headers_async,
    )
    assert resp.status_code == 200, resp.text
    items = {(i["slug"], i["platform"]): i for i in resp.json()["data"]}

    posted = items[("staff-posted", "facebook")]
    assert posted["status"] == "posted"
    assert posted["external_id"] == FB_POST
    assert posted["reason"] is None

    dead = items[("staff-dead", "facebook")]
    assert dead["status"] == "dead"
    assert "Invalid parameter" in dead["error"]

    skipped = items[("staff-skipped", "instagram")]
    assert skipped["status"] == "skipped"
    assert skipped["reason"] == REASON_NO_IMAGE


async def test_the_staff_list_shows_a_retrying_post_as_failed_with_its_reason(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(httpx.Response(429))
    await _intake_and_release(
        async_client,
        db_async,
        cms_secret,
        "staff-retrying",
        ["facebook", "whatsapp"],
        image=False,
    )
    # One attempt: the outbox keeps the row for a retry.
    await _drain(db_async, TOPIC_FB)

    resp = await async_client.get(
        _STAFF_URL,
        params={"slug": "staff-retrying"},
        headers=superuser_token_headers_async,
    )
    by_platform = {item["platform"]: item for item in resp.json()["data"]}
    assert by_platform["facebook"]["status"] == "failed"
    assert by_platform["facebook"]["error"] == "Meta is busy (HTTP 429)"
    assert by_platform["whatsapp"]["status"] == "pending"


async def test_a_link_host_removed_after_intake_is_not_posted(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _switch_live_on(db_async)
    fake_meta.answer = _answer_with(_ok({"id": FB_POST}))
    await _intake_and_release(
        async_client,
        db_async,
        cms_secret,
        "host-removed-link",
        ["facebook"],
        image=False,
    )
    # The owner takes the link host off the list after the post was saved.
    monkeypatch.setattr(settings, "SOCIAL_LINK_HOSTS", "elsewhere.example.test")
    assert await _drain(db_async, TOPIC_FB) == 1
    row = await _one(db_async, "host-removed-link", "facebook")
    assert row.status == "dead"
    assert row.error is not None
    assert "link host is no longer on the approved list" in row.error
    assert fake_meta.requests == []


async def test_an_image_host_removed_after_intake_is_not_posted(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _switch_live_on(db_async)
    await _intake_and_release(
        async_client, db_async, cms_secret, "host-removed-image", ["instagram"]
    )
    monkeypatch.setattr(settings, "SOCIAL_IMAGE_HOSTS", "elsewhere.example.test")
    assert await _drain(db_async, TOPIC_IG) == 1
    row = await _one(db_async, "host-removed-image", "instagram")
    assert row.status == "dead"
    assert row.error is not None
    assert "image host is no longer on the approved list" in row.error
    assert fake_meta.requests == []


@pytest.mark.parametrize(
    ("platform", "field", "bypass"),
    [
        ("facebook", "url", "https://evil.com\\x@allowed.com/p"),
        ("instagram", "imageUrl", "https://evil.com\\x@allowed.com/p"),
    ],
)
async def test_a_row_saved_before_the_address_rule_is_not_published(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    cms_secret: dict[str, str],
    fake_meta: FakeMeta,
    monkeypatch: pytest.MonkeyPatch,
    platform: str,
    field: str,
    bypass: str,
) -> None:
    # The bypass address was saved before the rule existed: the row is edited directly.
    # allowed.com is on the approved list, so only the address rule can stop the post.
    await _switch_live_on(db_async)
    slug = f"legacy-{platform}-{field.lower()}"
    await _intake_and_release(async_client, db_async, cms_secret, slug, [platform])
    monkeypatch.setattr(settings, "SOCIAL_LINK_HOSTS", "gms.example.test,allowed.com")
    monkeypatch.setattr(settings, "SOCIAL_IMAGE_HOSTS", "gms.example.test,allowed.com")
    [row] = await _rows(db_async, slug)
    if field == "url":
        row.url = bypass
        row.payload = {**row.payload, "url": bypass}
    else:
        row.payload = {**row.payload, "imageUrl": bypass}
    await db_async.commit()

    assert await _drain(db_async, f"social.post.{platform}") == 1
    row = await _one(db_async, slug, platform)
    assert row.status == "dead"
    assert row.error is not None
    assert "is not a plain https address" in row.error
    assert fake_meta.requests == []
