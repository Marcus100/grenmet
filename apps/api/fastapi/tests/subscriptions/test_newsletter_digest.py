"""What one day's climate newsletter contains. Sources are injected; nothing is sent."""

from datetime import UTC, datetime
from types import SimpleNamespace
from urllib.parse import quote

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.feature_flags import service as flag_service
from src.subscriptions import newsletter
from src.subscriptions.config import subscriptions_settings
from src.subscriptions.constants import HURRICANE_MODE_FLAG

_NOW = datetime(2026, 10, 28, 15, 0, tzinfo=UTC)  # 11:00 in Grenada
_DAY = _NOW.astimezone(newsletter.GRENADA).date()


def _alert(headline: str = "Yellow heavy rain warning") -> newsletter.DigestAlert:
    return newsletter.DigestAlert(
        headline=headline,
        event="Heavy rain",
        areas="Grenada",
        expires="28 Oct 2026, 18:00",
        link="https://weather.example.test/alerts/x",
    )


def _post(index: int = 0) -> newsletter.DigestPost:
    return newsletter.DigestPost(
        title=f"Post {index}",
        url=f"https://weather.example.test/stories/{index}",
        summary="A short summary.",
    )


async def _none_alerts(*_args: object) -> list[newsletter.DigestAlert]:
    return []


async def _none_posts(_day: object) -> list[newsletter.DigestPost]:
    return []


async def _forecast(_now: object) -> list[str]:
    return ["2026-10-28: high 31 °C, low 24 °C", "2026-10-29: high 30 °C, low 23 °C"]


async def test_a_day_with_nothing_to_say_composes_no_digest(
    db_async: AsyncSession,
) -> None:
    digest = await newsletter.compose(
        db_async,
        now=_NOW,
        hurricane_mode=False,
        alerts_loader=_none_alerts,
        forecast_loader=_forecast,
        posts_loader=_none_posts,
    )
    assert digest is None


async def test_forecast_alone_does_not_make_a_day_worth_sending(
    db_async: AsyncSession,
) -> None:
    built = await newsletter.build(
        db_async,
        now=_NOW,
        hurricane_mode=False,
        alerts_loader=_none_alerts,
        forecast_loader=_forecast,
        posts_loader=_none_posts,
    )
    assert built.empty
    assert built.forecast_lines  # present, but the digest is still skipped


async def test_alerts_come_first_then_forecast_then_posts(
    db_async: AsyncSession,
) -> None:
    async def alerts(*_args: object) -> list[newsletter.DigestAlert]:
        return [_alert()]

    async def posts(_day: object) -> list[newsletter.DigestPost]:
        return [_post(1)]

    digest = await newsletter.compose(
        db_async,
        now=_NOW,
        hurricane_mode=False,
        alerts_loader=alerts,
        forecast_loader=_forecast,
        posts_loader=posts,
    )
    assert digest is not None
    assert digest.day == _DAY
    assert [a.headline for a in digest.alerts] == ["Yellow heavy rain warning"]
    assert len(digest.forecast_lines) == 2
    assert [p.title for p in digest.posts] == ["Post 1"]
    assert digest.subject == "Weather alert: Yellow heavy rain warning - 28 Oct 2026"
    assert digest.hurricane_mode is False


async def test_subject_counts_several_alerts(db_async: AsyncSession) -> None:
    async def alerts(*_args: object) -> list[newsletter.DigestAlert]:
        return [_alert("One"), _alert("Two")]

    digest = await newsletter.compose(
        db_async,
        now=_NOW,
        hurricane_mode=False,
        alerts_loader=alerts,
        forecast_loader=_forecast,
        posts_loader=_none_posts,
    )
    assert digest is not None
    assert digest.subject == "2 weather alerts in effect - 28 Oct 2026"


async def test_hurricane_mode_is_shorter_and_leads_with_alerts(
    db_async: AsyncSession,
) -> None:
    async def alerts(*_args: object) -> list[newsletter.DigestAlert]:
        return [_alert()]

    async def posts(_day: object) -> list[newsletter.DigestPost]:
        return [_post(index) for index in range(5)]

    digest = await newsletter.compose(
        db_async,
        now=_NOW,
        hurricane_mode=True,
        alerts_loader=alerts,
        forecast_loader=_forecast,
        posts_loader=posts,
    )
    assert digest is not None
    assert digest.hurricane_mode is True
    assert len(digest.forecast_lines) == 1
    assert len(digest.posts) == newsletter.HURRICANE_POST_LIMIT
    assert digest.headline == "Hurricane season update"
    assert digest.subject.startswith("Weather alert:")


async def test_hurricane_mode_follows_its_feature_flag(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[str] = []

    async def fake_is_enabled(_session: object, key: str, **_kwargs: object) -> bool:
        seen.append(key)
        return key == HURRICANE_MODE_FLAG

    monkeypatch.setattr(flag_service, "is_enabled", fake_is_enabled)
    digest = await newsletter.build(
        db_async,
        now=_NOW,
        alerts_loader=_none_alerts,
        forecast_loader=_forecast,
        posts_loader=_none_posts,
    )
    assert seen == [HURRICANE_MODE_FLAG]
    assert digest.hurricane_mode is True


def test_props_carry_the_unsubscribe_link_and_only_test_sends_show_a_notice() -> None:
    digest = newsletter.Digest(
        day=_DAY,
        subject="s",
        headline="Today",
        alerts=(_alert(),),
        forecast_lines=("line",),
        posts=(_post(),),
        hurricane_mode=False,
        test=False,
    )
    props = newsletter.props(digest, unsubscribe_link="https://api/unsub?token=t")
    assert props["unsubscribeLink"] == "https://api/unsub?token=t"
    assert props["listName"] == "GMS climate newsletter"
    assert props["testNotice"] is None
    assert props["alerts"][0]["headline"] == "Yellow heavy rain warning"
    assert props["forecastLines"] == ["line"]
    assert props["posts"][0]["url"].endswith("/stories/0")

    test_digest = newsletter.Digest(
        day=_DAY,
        subject="Test: s",
        headline="Today",
        alerts=(),
        forecast_lines=(),
        posts=(),
        hurricane_mode=False,
        test=True,
    )
    notice = newsletter.props(test_digest, unsubscribe_link="u")["testNotice"]
    assert notice.startswith("This is a test copy")


def test_forecast_lines_report_the_first_two_days_in_celsius() -> None:
    forecast = SimpleNamespace(
        periods=[
            SimpleNamespace(date="2026-10-28", high=31.4, low=24.2),
            SimpleNamespace(date="2026-10-29", high=None, low=None),
            SimpleNamespace(date="2026-10-30", high=30.0, low=23.6),
            SimpleNamespace(date="2026-10-31", high=30.0, low=23.6),
            SimpleNamespace(date="2026-11-01", high=30.0, low=23.6),
        ]
    )
    assert newsletter.forecast_lines(forecast) == [
        "2026-10-28: high 31 °C, low 24 °C",
    ]


def _feed_transport(payload: object, status: int = 200) -> httpx.MockTransport:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=payload)

    return httpx.MockTransport(handler)


def _item(**overrides: object) -> dict[str, object]:
    item: dict[str, object] = {
        "title": "Rainfall report",
        "url": "https://weather.example.test/stories/rain",
        "summary": "Rain was above normal.",
        "includeInNewsletter": True,
        "publishedAt": "2026-10-28T09:00:00-04:00",
    }
    item.update(overrides)
    return item


@pytest.fixture
def feed_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        subscriptions_settings,
        "NEWSLETTER_POSTS_FEED_URL",
        "https://feed.example.test/newsletter-posts.json",
    )


async def test_feed_keeps_only_flagged_posts_published_today(feed_url: None) -> None:
    _ = feed_url
    payload = {
        "items": [
            _item(),
            _item(title="Not flagged", includeInNewsletter=False),
            _item(title="Yesterday", publishedAt="2026-10-27T09:00:00-04:00"),
        ]
    }
    posts = await newsletter.fetch_flagged_posts(
        _DAY, transport=_feed_transport(payload)
    )
    assert [p.title for p in posts] == ["Rainfall report"]


async def test_feed_ignores_items_with_unsafe_or_malformed_fields(
    feed_url: None,
) -> None:
    _ = feed_url
    payload = {
        "items": [
            _item(url="javascript:alert(1)", title="Bad link"),
            _item(title=""),
            _item(publishedAt="not a time"),
            _item(title="Good one"),
        ]
    }
    posts = await newsletter.fetch_flagged_posts(
        _DAY, transport=_feed_transport(payload)
    )
    assert [p.title for p in posts] == ["Good one"]


async def test_unavailable_feed_means_no_posts_not_a_failed_digest() -> None:
    posts = await newsletter.fetch_flagged_posts(
        _DAY, transport=_feed_transport({}, status=503)
    )
    assert posts == []


async def test_no_feed_url_means_no_posts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subscriptions_settings, "NEWSLETTER_POSTS_FEED_URL", None)
    assert await newsletter.fetch_flagged_posts(_DAY) == []


async def test_public_alerts_link_to_the_alert_page_in_grenada_time(
    db_async: AsyncSession,
) -> None:
    from tests.worker.test_dispatch import _add_published_alert

    alert = await _add_published_alert(db_async)
    alerts = await newsletter.public_alerts(db_async)
    encoded = quote(alert.identifier, safe="")
    ours = [a for a in alerts if a.link.endswith(f"/alerts/{encoded}")]
    assert ours, "the published alert is in the digest"
    assert "/alerts/" in ours[0].link
