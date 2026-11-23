"""RSS channel and item links must be absolute URLs (feed readers, WMO Alert Hub)."""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from defusedxml import ElementTree as DefusedET

from src.cap import router
from src.cap.models import CapMessageType


def _alert(identifier: str, xml_url: str | None) -> SimpleNamespace:
    return SimpleNamespace(
        identifier=identifier,
        msg_type=CapMessageType.ALERT,
        references=[],
        info=[SimpleNamespace(headline="Heavy rain", description="Rain bands.")],
        sent=datetime(2026, 11, 22, 12, tzinfo=UTC),
        xml_url=xml_url,
        note=None,
    )


def _channel_links(xml: str) -> tuple[str, list[str]]:
    channel = DefusedET.fromstring(xml).find("channel")
    assert channel is not None
    link = channel.findtext("link")
    assert link is not None
    return link, [item.findtext("link") or "" for item in channel.findall("item")]


def test_rss_channel_and_item_links_are_absolute(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(router.settings, "API_BASE_URL", "https://api.example.test/")
    xml = router._rss_xml(
        [_alert("CAP-1", None), _alert("CAP-2", "/api/cap/CAP-2.xml")]
    )

    channel_link, item_links = _channel_links(xml)
    assert channel_link == "https://api.example.test/api/cap/latest-active"
    assert item_links == [
        "https://api.example.test/api/cap/CAP-1.xml",
        "https://api.example.test/api/cap/CAP-2.xml",
    ]


def test_rss_keeps_an_absolute_xml_url_as_it_is(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(router.settings, "API_BASE_URL", "https://api.example.test")
    xml = router._rss_xml([_alert("CAP-3", "https://cdn.example.test/CAP-3.xml")])
    _, item_links = _channel_links(xml)
    assert item_links == ["https://cdn.example.test/CAP-3.xml"]
