"""Unit tests for the shared confirmation-card layout (``src/email_layout.py``).

Pure: no database. They pin escaping, the URL allow-list, the contrast fallback,
the table-button markup, the plain-text part and the calendar link.
"""

from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

import pytest

from src import email_layout as layout

NAVY = "#0b132b"


def _card(**overrides: object) -> layout.Card:
    base: dict[str, object] = {
        "eyebrow": "Babydoll Beauty Bar",
        "title": "Your booking is confirmed",
        "chip": layout.Chip("Confirmed"),
        "greeting": "Hello Ann,",
        "paragraphs": ("Thank you for booking.",),
        "rows": (
            layout.Row("What", "Haircut with Jeriann"),
            layout.Row("When", "Friday 23 October 2026, 7:30 AM (Grenada time)"),
            layout.Row("Reference", "AB12CD34"),
        ),
        "primary": layout.Action("Manage booking", "https://babydoll.example/manage/x"),
        "secondary": (
            layout.Action("Add to Google Calendar", "https://calendar.google.com/x"),
        ),
        "policy": ("Changes are closed 24 hours before the start.",),
        "footer": "You are getting this email because you booked.",
    }
    base.update(overrides)
    return layout.EmailCard(**base)  # type: ignore[arg-type]


def test_document_is_a_full_html_page_with_house_colours() -> None:
    html = layout.render_html(_card())
    assert html.startswith("<!DOCTYPE html>")
    assert "#f3f8fc" in html  # the page background from notification.tsx
    assert "border-radius:8px" in html  # the 8px card
    assert "max-width:600px" in html
    assert "<script" not in html.lower()
    assert "<img" not in html.lower()  # no external images
    assert "@import" not in html and "<link" not in html  # no external fonts


def test_every_value_is_escaped() -> None:
    card = _card(
        eyebrow="<b>Studio</b>",
        title='<img src=x onerror="alert(1)">',
        greeting="Hello &amp; <i>Ann</i>,",
        rows=(layout.Row('"What"', "<script>x</script>"),),
    )
    html = layout.render_html(card)
    assert "<script>x</script>" not in html
    assert "<img src=x" not in html
    assert "&lt;script&gt;x&lt;/script&gt;" in html
    assert "&lt;b&gt;Studio&lt;/b&gt;" in html
    assert "&amp;amp;" in html  # the ampersand in the greeting is escaped too
    assert '"What"' in html  # quotes are safe in text; attributes still get &quot;


def test_unsafe_urls_are_dropped_not_rendered() -> None:
    for bad in (
        "javascript:alert(1)",
        "data:text/html,<b>x</b>",
        "/relative/path",
        "https://",
        "https://ok.example/x y",
        "https://ok.example/\r\nBcc: a@b.c",
        "",
    ):
        card = _card(
            primary=layout.Action("Manage booking", bad),
            secondary=(layout.Action("Calendar", bad),),
        )
        html = layout.render_html(card)
        text = layout.render_text(card)
        assert "Manage booking" not in html, bad
        assert "Calendar" not in html, bad
        assert "javascript:" not in html and "data:text" not in html, bad
        assert "Bcc" not in text, bad


def test_missing_action_url_is_dropped() -> None:
    card = _card(primary=layout.Action("Manage booking", None), secondary=())
    assert "Manage booking" not in layout.render_html(card)


def test_http_and_https_links_are_kept() -> None:
    for good in ("http://localhost:3015/x", "https://barrels.gd/x?a=1&b=2"):
        html = layout.render_html(
            _card(primary=layout.Action("Open", good), secondary=())
        )
        assert "Open" in html
        assert layout.safe_url(good) == good


def test_a_low_contrast_accent_falls_back_to_navy() -> None:
    # Yellow is far below 4.5:1 against white text.
    html = layout.render_html(_card(accent="#ffff00"))
    assert "#ffff00" not in html
    assert NAVY in html


def test_an_invalid_accent_falls_back_to_navy_and_cannot_inject_css() -> None:
    for bad in ("red", "#fff", "#0b132b;background:url(x)", "javascript:1", ""):
        html = layout.render_html(_card(accent=bad))
        assert "url(x)" not in html
        assert NAVY in html


def test_a_passing_accent_is_used_for_the_button_and_chip() -> None:
    html = layout.render_html(_card(accent="#0b63ee"))
    assert 'bgcolor="#0b63ee"' in html  # the primary button cell
    assert "background-color:#0b63ee" in html  # the chip


def test_primary_button_is_a_table_button_with_dark_mode_safe_cell() -> None:
    html = layout.render_html(_card())
    # The background sits on the table cell (survives clients that ignore links).
    assert f'bgcolor="{NAVY}"' in html
    assert f"background-color:{NAVY}" in html
    assert 'role="presentation"' in html
    # 44px tall: 12px padding, 20px line height, 12px padding.
    assert "padding:12px 24px" in html and "line-height:20px" in html
    # Full width (every size): the button table is 100% wide.
    assert 'width="100%"' in html


def test_primary_button_text_is_white_on_the_accent() -> None:
    html = layout.render_html(_card())
    assert "color:#ffffff" in html


def test_secondary_actions_are_outline_buttons() -> None:
    html = layout.render_html(_card())
    assert "border:2px solid" in html
    assert "https://calendar.google.com/x" in html


def test_chip_is_a_coloured_pill_with_the_label() -> None:
    html = layout.render_html(_card(chip=layout.Chip("Confirmed")))
    assert ">Confirmed<" in html
    assert "border-radius:999px" in html
    muted = layout.render_html(
        _card(chip=layout.Chip("Cancelled", layout.ChipTone.MUTED))
    )
    assert ">Cancelled<" in muted


def test_no_chip_or_sections_when_absent() -> None:
    card = layout.EmailCard(eyebrow="Biz", title="Plain", footer="Why")
    html = layout.render_html(card)
    assert "Plain" in html and "Why" in html
    assert "Hello" not in html
    assert "border-top:1px solid #e5e7eb" not in html  # no details table


def test_grey_label_column_in_the_details_block() -> None:
    html = layout.render_html(_card())
    assert "Haircut with Jeriann" in html
    assert "color:#6b7280" in html  # grey labels


def test_quiet_paragraph_with_a_link() -> None:
    card = _card(
        quiet="Booking never needs an account.",
        quiet_link=layout.Action(
            "Create a free account or sign in", "https://auth.example/signup"
        ),
    )
    html = layout.render_html(card)
    assert "Booking never needs an account." in html
    assert 'href="https://auth.example/signup"' in html
    text = layout.render_text(card)
    assert "Create a free account or sign in: https://auth.example/signup" in text


def test_plain_text_part_carries_the_same_facts() -> None:
    text = layout.render_text(_card())
    assert "Babydoll Beauty Bar" in text
    assert "Status: Confirmed" in text
    assert "Your booking is confirmed" in text
    assert "Hello Ann," in text
    assert "What: Haircut with Jeriann" in text
    assert "When: Friday 23 October 2026, 7:30 AM (Grenada time)" in text
    assert "Reference: AB12CD34" in text
    assert "Manage booking: https://babydoll.example/manage/x" in text
    assert "Changes are closed 24 hours before the start." in text
    assert "<" not in text and "</" not in text


def test_with_subject_flattens_the_subject_onto_the_card() -> None:
    card = layout.with_subject("Your booking\r\nis confirmed", _card())
    assert card.subject == "Your booking is confirmed"
    rendered = layout.render_fallback(card)
    assert rendered.subject == "Your booking is confirmed"
    assert rendered.html.startswith("<!DOCTYPE html>")
    assert "Your booking is confirmed" in rendered.text


def test_preview_is_hidden_and_escaped() -> None:
    html = layout.render_html(_card(title="<b>x</b>"))
    assert "display:none" in html
    assert "<b>x</b>" not in html


def test_google_calendar_link_carries_title_dates_location_and_utc() -> None:
    url = layout.google_calendar_url(
        title="Haircut with Jeriann",
        starts_at=datetime(2026, 11, 23, 11, 30),  # naive UTC
        ends_at=datetime(2026, 11, 23, 12, 15),
        location="Lower Lucas Street",
        details="Booked with Babydoll Beauty Bar",
    )
    parts = urlsplit(url)
    assert parts.scheme == "https"
    assert parts.netloc == "calendar.google.com"
    query = parse_qs(parts.query)
    assert query["action"] == ["TEMPLATE"]
    assert query["text"] == ["Haircut with Jeriann"]
    assert query["dates"] == ["20261123T113000Z/20261123T121500Z"]
    assert query["location"] == ["Lower Lucas Street"]
    assert query["details"] == ["Booked with Babydoll Beauty Bar"]


def test_google_calendar_link_takes_aware_datetimes_as_utc() -> None:
    url = layout.google_calendar_url(
        title="T",
        starts_at=datetime(2026, 11, 23, 11, 30, tzinfo=UTC),
        ends_at=datetime(2026, 11, 23, 12, 0, tzinfo=UTC),
    )
    assert parse_qs(urlsplit(url).query)["dates"] == [
        "20261123T113000Z/20261123T120000Z"
    ]
    assert "location" not in parse_qs(urlsplit(url).query)


def test_first_name_takes_the_first_word_and_a_fallback() -> None:
    assert layout.first_name("Ann Marie Bowen") == "Ann"
    assert layout.first_name("  ") == "there"
    assert layout.first_name("") == "there"


def test_code_block_is_large_monospace_and_in_the_text_part() -> None:
    card = layout.EmailCard(
        eyebrow="Biz", title="Your code", code="482913", footer="Why"
    )
    html = layout.render_html(card)
    assert "Courier New" in html and "font-size:32px" in html
    assert ">482913</td>" in html
    assert "Code: 482913" in layout.render_text(card)


def test_copy_link_fallback_is_escaped_and_unsafe_urls_dropped() -> None:
    url = "https://app.example/reset?token=abc&x=<y>"
    card = layout.EmailCard(
        eyebrow="Biz", title="Reset", link_fallback=url, footer="Why"
    )
    html = layout.render_html(card)
    assert "copy this link into your browser" in html
    assert 'href="https://app.example/reset?token=abc&amp;x=&lt;y&gt;"' in html
    assert (
        "open this link: https://app.example/reset?token=abc&x=<y>"
        in layout.render_text(card)
    )
    bad = layout.EmailCard(eyebrow="Biz", title="Reset", link_fallback="javascript:1")
    assert "copy this link" not in layout.render_html(bad)


def test_single_button_card_has_no_details_block() -> None:
    card = layout.EmailCard(
        eyebrow="Biz",
        title="Set your password",
        paragraphs=("Use the button to choose a password.",),
        primary=layout.Action("Set password", "https://app.example/reset"),
        link_fallback="https://app.example/reset",
    )
    html = layout.render_html(card)
    assert "Set password" in html
    assert "border-top:1px solid #e5e7eb" not in html
    assert "Courier New" not in html


def test_render_email_returns_html_and_text_without_a_subject() -> None:
    rendered = layout.render_fallback(_card())
    assert rendered.html.startswith("<!DOCTYPE html>")
    assert "What: Haircut with Jeriann" in rendered.text


def test_layout_module_imports_no_domain_code() -> None:
    from pathlib import Path

    source = Path(layout.__file__).read_text()
    for domain in ("bookings", "events", "auth", "billing", "contact"):
        assert f"from src.{domain}" not in source


def test_props_round_trip_through_to_props_and_from_props() -> None:
    card = layout.with_subject(
        "Subject",
        _card(
            chip=layout.Chip("Cancelled", layout.ChipTone.MUTED),
            money=(layout.Row("Refunded", "XCD 10.00"),),
            secondary=(layout.Action("Calendar", "https://calendar.example/x"),),
            quiet="Quiet line",
            quiet_link=layout.Action("Sign in", "https://auth.example/signin"),
            code="482913",
            preview="Preview text",
        ),
    )
    props = layout.to_props(card)
    assert props["chip"] == {"label": "Cancelled", "tone": "muted"}
    assert props["primary"] == {
        "label": "Manage booking",
        "url": "https://babydoll.example/manage/x",
    }
    assert props["linkFallback"] is None
    assert props["quietLink"] == {
        "label": "Sign in",
        "url": "https://auth.example/signin",
    }
    assert layout.from_props(props) == card


def test_render_card_without_a_render_service_uses_the_python_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    monkeypatch.setattr(layout.email_settings, "EMAIL_RENDER_URL", None)
    card = layout.with_subject("Hello", _card())
    rendered = asyncio.run(layout.render_card(card))
    assert rendered == layout.render_fallback(card)


def test_render_card_falls_back_when_the_render_service_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    async def boom(_template: str, _props: dict[str, object]) -> object:
        raise RuntimeError("render service down")

    monkeypatch.setattr(layout.email_settings, "EMAIL_RENDER_URL", "http://render.test")
    monkeypatch.setattr(layout.email_module, "render_remote", boom)
    card = layout.with_subject("Hello", _card())
    rendered = asyncio.run(layout.render_card(card))
    assert rendered.html == layout.render_fallback(card).html


def test_render_card_uses_the_render_service_html_and_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    from src.email import EmailData

    seen: list[tuple[str, dict[str, object]]] = []

    async def remote(template: str, props: dict[str, object]) -> EmailData:
        seen.append((template, props))
        return EmailData(
            html_content="<p>react</p>", subject="Hello", text_content="react text"
        )

    monkeypatch.setattr(layout.email_settings, "EMAIL_RENDER_URL", "http://render.test")
    monkeypatch.setattr(layout.email_module, "render_remote", remote)
    card = layout.with_subject("Hello", _card())
    rendered = asyncio.run(layout.render_card(card))
    assert seen[0][0] == layout.CARD_TEMPLATE
    assert seen[0][1] == layout.to_props(card)
    assert rendered == ("Hello", "<p>react</p>", "react text")


def test_logo_is_an_https_image_at_40px_with_alt_text() -> None:
    card = _card(logo=layout.Logo("https://cdn.example.test/logo.png", "Sample Studio"))
    html = layout.render_html(card)
    assert (
        '<img src="https://cdn.example.test/logo.png" alt="Sample Studio" height="40"'
        in html
    )
    assert "height:40px" in html
    assert "Sample Studio" in layout.render_text(
        card
    ) or "Babydoll" in layout.render_text(card)


def test_logo_with_a_non_https_url_is_dropped() -> None:
    for bad in ("http://cdn.example.test/logo.png", "javascript:alert(1)", "/logo.png"):
        html = layout.render_html(_card(logo=layout.Logo(bad, "Studio")))
        assert "<img" not in html, bad


def test_logo_survives_the_props_round_trip() -> None:
    card = _card(logo=layout.Logo("https://cdn.example.test/logo.png", "Studio"))
    assert layout.to_props(card)["logo"] == {
        "url": "https://cdn.example.test/logo.png",
        "alt": "Studio",
    }
    assert layout.from_props(layout.to_props(card)) == card
