"""Shared confirmation-card layout for customer emails (bookings, events, codes).

Pure: data in, ``Message(subject, html, text)`` out, no database and no I/O.

The markup is table-based with inline styles only: no external images, fonts or
stylesheets, and no JavaScript. Every value is HTML-escaped, and a link must be
http(s) (anything else is dropped). The business accent colour is used only for the
status chip, the primary button and link text. It falls back to the Barrels navy
(``--gm-navy``, as in ``packages/email-templates/src/notification.tsx``) unless it is
a six-digit hex colour that clears 4.5:1 against white, the contrast the white
button text needs.
"""

import html
import logging
import re
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from enum import Enum
from typing import Any, NamedTuple
from urllib.parse import urlencode, urlsplit

from src import email as email_module
from src.email_config import email_settings

logger = logging.getLogger(__name__)

NAVY = "#0b132b"
MIN_CONTRAST = 4.5
PAGE_BACKGROUND = "#f3f8fc"
_FONT = "Arial,Helvetica,sans-serif"
_HEX = re.compile(r"#[0-9a-fA-F]{6}")
_UNSAFE_URL_CHARS = re.compile(r"[\x00-\x20\x7f]")
_CALENDAR = "https://calendar.google.com/calendar/render"
BODY_TEXT = "font-size:16px;line-height:24px;color:#374151;"


class ChipTone(str, Enum):
    #: Live statuses (confirmed, reminder, received): the business accent.
    ACCENT = "accent"
    #: Ended statuses (cancelled, declined, refunded): neutral grey.
    MUTED = "muted"


@dataclass(frozen=True)
class Chip:
    label: str
    tone: ChipTone = ChipTone.ACCENT


@dataclass(frozen=True)
class Row:
    label: str
    value: str


@dataclass(frozen=True)
class Action:
    """A button or link. ``url`` None (or unsafe) drops the action."""

    label: str
    url: str | None


@dataclass(frozen=True)
class Logo:
    """A logo at the top of the card. Only https images are shown; the business
    name stays in the text (``alt``) for clients that block images."""

    url: str
    alt: str


@dataclass(frozen=True, kw_only=True)
class EmailCard:
    """One customer email as data. React Email renders it (``CARD_TEMPLATE``);
    ``render_fallback`` is the plain Python rendering used when the render service
    is off or fails. ``to_props`` gives the camelCase props the template takes."""

    subject: str = ""
    logo: Logo | None = None
    eyebrow: str = ""
    title: str = ""
    chip: Chip | None = None
    greeting: str | None = None
    paragraphs: tuple[str, ...] = ()
    rows: tuple[Row, ...] = ()
    money: tuple[Row, ...] = ()
    #: A six-to-eight character code shown large in monospace (sign-in codes).
    code: str | None = None
    primary: Action | None = None
    secondary: tuple[Action, ...] = ()
    #: "If the button does not work" fallback: the URL is repeated as text.
    link_fallback: str | None = None
    policy: tuple[str, ...] = ()
    #: A quiet secondary paragraph, optionally with one text link.
    quiet: str | None = None
    quiet_link: Action | None = None
    footer: str = ""
    accent: str = NAVY
    preview: str | None = None


class RenderedEmail(NamedTuple):
    subject: str
    html: str
    text: str


#: The React Email template every card is rendered with (packages/email-templates).
CARD_TEMPLATE = "card"
#: A hung render service must not hold up each card mail inside the outbox
#: transaction; the Python fallback is the safety net.
CARD_RENDER_TIMEOUT_SECONDS = 3.0


# ── Values ────────────────────────────────────────────────────────────────────


def _e(value: str) -> str:
    """Escape for an attribute value (quotes too)."""
    return html.escape(value, quote=True)


def _t(value: str) -> str:
    """Escape for text nodes: apostrophes stay readable ("You're")."""
    return html.escape(value, quote=False)


def safe_url(value: str | None) -> str | None:
    """The value when it is an absolute http(s) URL with no whitespace or control
    characters, else None."""
    if not value or _UNSAFE_URL_CHARS.search(value):
        return None
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    return value


def _luminance(colour: str) -> float:
    def channel(index: int) -> float:
        value = int(colour[index : index + 2], 16) / 255
        if value <= 0.03928:
            return value / 12.92
        return float(((value + 0.055) / 1.055) ** 2.4)

    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)


def contrast_with_white(colour: str) -> float:
    return 1.05 / (_luminance(colour) + 0.05)


def safe_accent(value: str | None) -> str:
    """A six-digit hex accent that clears 4.5:1 against white, else the navy."""
    if value and _HEX.fullmatch(value) and contrast_with_white(value) >= MIN_CONTRAST:
        return value.lower()
    return NAVY


def first_name(full: str | None) -> str:
    parts = (full or "").split()
    return parts[0] if parts else "there"


def duration_label(minutes: int) -> str:
    hours, rest = divmod(minutes, 60)
    words = []
    if hours:
        words.append(f"{hours} hour" if hours == 1 else f"{hours} hours")
    if rest:
        words.append(f"{rest} minute" if rest == 1 else f"{rest} minutes")
    return " ".join(words) or "0 minutes"


def _utc_stamp(moment: datetime) -> str:
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC).replace(tzinfo=None)
    return moment.strftime("%Y%m%dT%H%M%SZ")


def google_calendar_url(
    *,
    title: str,
    starts_at: datetime,
    ends_at: datetime,
    location: str | None = None,
    details: str | None = None,
) -> str:
    """A Google Calendar "add event" link. ``starts_at`` and ``ends_at`` are UTC
    (naive values are read as UTC, as the database stores them)."""
    params = {
        "action": "TEMPLATE",
        "text": title,
        "dates": f"{_utc_stamp(starts_at)}/{_utc_stamp(ends_at)}",
    }
    if details:
        params["details"] = details
    if location:
        params["location"] = location
    return f"{_CALENDAR}?{urlencode(params)}"


def with_subject(subject: str, card: EmailCard) -> EmailCard:
    """``card`` with its subject set (one line, at most 300 characters)."""
    return replace(card, subject=" ".join(subject.split())[:300])


def render_fallback(card: EmailCard) -> RenderedEmail:
    """The built-in Python rendering: plain and correct, not pixel-matched to the
    React template. Used when the render service is not configured or fails."""
    return RenderedEmail(card.subject, render_html(card), render_text(card))


def _action_props(action: Action | None) -> dict[str, str] | None:
    return {"label": action.label, "url": action.url or ""} if action else None


def to_props(card: EmailCard) -> dict[str, Any]:
    """The props the ``card`` React template takes (camelCase, JSON-safe)."""
    return {
        "subject": card.subject,
        "logo": {"url": card.logo.url, "alt": card.logo.alt} if card.logo else None,
        "eyebrow": card.eyebrow,
        "chip": {"label": card.chip.label, "tone": card.chip.tone.value}
        if card.chip
        else None,
        "title": card.title,
        "greeting": card.greeting,
        "paragraphs": list(card.paragraphs),
        "rows": [{"label": r.label, "value": r.value} for r in card.rows],
        "money": [{"label": r.label, "value": r.value} for r in card.money],
        "code": card.code,
        "primary": _action_props(card.primary),
        "secondary": [_action_props(a) for a in card.secondary],
        "linkFallback": card.link_fallback,
        "policy": list(card.policy),
        "quiet": card.quiet,
        "quietLink": _action_props(card.quiet_link),
        "footer": card.footer,
        "accent": card.accent,
        "preview": card.preview,
    }


def _action_from(props: Any) -> Action | None:
    if not isinstance(props, dict):
        return None
    return Action(str(props.get("label", "")), props.get("url"))


def _rows_from(items: Any) -> tuple[Row, ...]:
    return tuple(
        Row(str(item.get("label", "")), str(item.get("value", "")))
        for item in items or ()
        if isinstance(item, dict)
    )


def _logo_from(props: Any) -> Logo | None:
    if not isinstance(props, dict) or not props.get("url"):
        return None
    return Logo(str(props["url"]), str(props.get("alt", "")))


def safe_logo(logo: Logo | None) -> Logo | None:
    """The logo when its URL is an https address (images come from the business's host)."""
    if logo is None or not logo.alt:
        return None
    url = safe_url(logo.url)
    if url is None or urlsplit(url).scheme != "https":
        return None
    return logo


def from_props(props: dict[str, Any]) -> EmailCard:
    """The card a ``to_props`` dict describes (the delivery side rebuilds it from
    the outbox payload, then renders it)."""
    chip_props = props.get("chip")
    chip = None
    if isinstance(chip_props, dict):
        tone = ChipTone.MUTED if chip_props.get("tone") == "muted" else ChipTone.ACCENT
        chip = Chip(str(chip_props.get("label", "")), tone)
    secondary = tuple(
        action
        for action in (_action_from(item) for item in props.get("secondary") or ())
        if action is not None
    )
    return EmailCard(
        subject=str(props.get("subject", "")),
        logo=_logo_from(props.get("logo")),
        eyebrow=str(props.get("eyebrow") or ""),
        title=str(props.get("title", "")),
        chip=chip,
        greeting=props.get("greeting"),
        paragraphs=tuple(str(p) for p in props.get("paragraphs") or ()),
        rows=_rows_from(props.get("rows")),
        money=_rows_from(props.get("money")),
        code=props.get("code"),
        primary=_action_from(props.get("primary")),
        secondary=secondary,
        link_fallback=props.get("linkFallback"),
        policy=tuple(str(p) for p in props.get("policy") or ()),
        quiet=props.get("quiet"),
        quiet_link=_action_from(props.get("quietLink")),
        footer=str(props.get("footer") or ""),
        accent=str(props.get("accent") or NAVY),
        preview=props.get("preview"),
    )


async def render_card(card: EmailCard) -> RenderedEmail:
    """Render with React Email (``render_remote``); any failure, or the render
    service being off, falls back to the Python rendering so the mail still goes."""
    if email_settings.EMAIL_RENDER_URL:
        try:
            data = await email_module.render_remote(
                CARD_TEMPLATE,
                to_props(card),
                timeout_seconds=CARD_RENDER_TIMEOUT_SECONDS,
            )
        except Exception:  # noqa: BLE001 - the fallback is the safety net
            logger.warning("React Email card render failed; using the Python fallback")
        else:
            text = data.text_content or render_text(card)
            return RenderedEmail(data.subject or card.subject, data.html_content, text)
    return render_fallback(card)


# ── Plain text ────────────────────────────────────────────────────────────────


def _one_line(value: str) -> str:
    """A value on one text line: control characters and newlines become spaces, so a
    value cannot fake another label line in the plain-text part."""
    return " ".join(value.split())


def _usable(action: Action | None) -> str | None:
    """The label and URL pair, as text, when the action has a safe URL."""
    if action is None or safe_url(action.url) is None:
        return None
    return f"{action.label}: {action.url}"


def render_text(card: EmailCard) -> str:
    lines: list[str] = []
    if card.eyebrow:
        lines.append(card.eyebrow)
    if card.chip:
        lines.append(f"Status: {card.chip.label}")
    lines += ["", card.title, ""]
    if card.greeting:
        lines += [card.greeting, ""]
    if card.code:
        lines += [f"Code: {card.code}", ""]
    lines += [*card.paragraphs, ""]
    details = [
        f"{_one_line(row.label)}: {_one_line(row.value)}"
        for row in (*card.rows, *card.money)
        if row.value
    ]
    if details:
        lines += details + [""]
    actions = [text for text in map(_usable, (card.primary, *card.secondary)) if text]
    if actions:
        lines += actions + [""]
    if card.link_fallback and safe_url(card.link_fallback):
        lines += [
            f"If the button does not work, open this link: {card.link_fallback}",
            "",
        ]
    for line in card.policy:
        lines += [line, ""]
    if card.quiet:
        quiet = card.quiet
        link = _usable(card.quiet_link)
        lines += [f"{quiet} {link}" if link else quiet, ""]
    if card.footer:
        lines += ["---", card.footer]
    return "\n".join(lines).strip() + "\n"


# ── HTML ──────────────────────────────────────────────────────────────────────


def _button(label: str, url: str, *, accent: str, primary: bool) -> str:
    background = accent if primary else "#ffffff"
    text = "#ffffff" if primary else accent
    border = "none" if primary else f"2px solid {accent}"
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'border="0" style="margin:0 0 12px;">'
        f'<tr><td align="center" bgcolor="{background}" '
        f'style="background-color:{background};border:{border};border-radius:8px;padding:12px 24px;">'
        f'<a href="{_e(url)}" style="display:block;'
        f"line-height:20px;font-family:{_FONT};font-size:16px;font-weight:bold;"
        f'color:{text};text-decoration:none;text-align:center;border-radius:8px;">'
        f"{_t(label)}</a></td></tr></table>"
    )


def _chip(chip: Chip, *, accent: str) -> str:
    if chip.tone is ChipTone.ACCENT:
        background, text = accent, "#ffffff"
    else:
        background, text = "#e5e7eb", "#111827"
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'style="margin:0 0 16px;"><tr>'
        f'<td bgcolor="{background}" style="background-color:{background};'
        f"border-radius:999px;padding:4px 12px;font-family:{_FONT};font-size:13px;"
        f'font-weight:bold;line-height:18px;color:{text};">{_t(chip.label)}</td>'
        "</tr></table>"
    )


def _code(code: str) -> str:
    """A verification code: large monospace on a light grey cell (readable and
    selectable, no image)."""
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'border="0" style="margin:8px 0 20px;"><tr>'
        '<td align="center" bgcolor="#f3f4f6" style="background-color:#f3f4f6;'
        "border-radius:8px;padding:20px 16px;font-family:'Courier New',"
        "Courier,monospace;font-size:32px;line-height:40px;font-weight:bold;"
        f'letter-spacing:6px;color:#0b132b;">{_t(code)}</td></tr></table>'
    )


def _rows(rows: tuple[Row, ...]) -> str:
    shown = [row for row in rows if row.value]
    if not shown:
        return ""
    body = "".join(
        "<tr>"
        '<td valign="top" style="width:88px;padding:10px 12px 10px 0;'
        "border-top:1px solid #e5e7eb;color:#6b7280;font-family:"
        f'{_FONT};font-size:13px;line-height:20px;">{_t(row.label)}</td>'
        '<td valign="top" style="padding:10px 0;border-top:1px solid #e5e7eb;'
        f'color:#0b132b;font-family:{_FONT};font-size:15px;line-height:22px;">'
        f"{_t(row.value)}</td></tr>"
        for row in shown
    )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'border="0" style="margin:8px 0 20px;">{body}</table>'
    )


def _paragraph(text: str, style: str) -> str:
    return f'<p style="margin:0 0 12px;{style}">{_t(text)}</p>'


def render_html(card: EmailCard) -> str:
    accent = safe_accent(card.accent)
    title = _t(card.title)
    preview = _t(card.preview or card.title)
    parts: list[str] = []
    logo = safe_logo(card.logo)
    if logo is not None:
        parts.append(
            f'<img src="{_e(logo.url)}" alt="{_e(logo.alt)}" height="40" '
            'style="display:block;height:40px;border:0;margin:0 0 16px;">'
        )
    if card.eyebrow:
        parts.append(
            f'<p style="margin:0 0 8px;font-family:{_FONT};font-size:13px;'
            'letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;">'
            f"{_t(card.eyebrow)}</p>"
        )
    if card.chip:
        parts.append(_chip(card.chip, accent=accent))
    parts.append(
        f'<h1 style="margin:0 0 16px;font-family:{_FONT};font-size:24px;'
        f'line-height:32px;font-weight:bold;color:#0b132b;">{title}</h1>'
    )
    if card.greeting:
        parts.append(_paragraph(card.greeting, BODY_TEXT))
    for paragraph in card.paragraphs:
        parts.append(_paragraph(paragraph, BODY_TEXT))
    if card.code:
        parts.append(_code(card.code))
    parts.append(_rows((*card.rows, *card.money)))
    primary = card.primary
    if primary is not None and safe_url(primary.url):
        parts.append(
            _button(primary.label, primary.url or "", accent=accent, primary=True)
        )
    for action in card.secondary:
        if safe_url(action.url):
            parts.append(
                _button(action.label, action.url or "", accent=accent, primary=False)
            )
    if card.link_fallback and safe_url(card.link_fallback):
        parts.append(
            f'<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#6b7280;">'
            f"If the button does not work, copy this link into your browser:<br>"
            f'<a href="{_e(card.link_fallback)}" style="color:{accent};word-break:break-all;text-decoration:underline;">'
            f"{_t(card.link_fallback)}</a></p>"
        )
    for line in card.policy:
        parts.append(_paragraph(line, "font-size:14px;line-height:21px;color:#4b5563;"))
    if card.quiet:
        link = ""
        if card.quiet_link and safe_url(card.quiet_link.url):
            link = (
                f' <a href="{_e(card.quiet_link.url or "")}" '
                f'style="color:{accent};font-weight:bold;text-decoration:underline;">'
                f"{_t(card.quiet_link.label)}</a>"
            )
        parts.append(
            f'<p style="margin:16px 0 0;font-size:14px;line-height:21px;color:#6b7280;">'
            f"{_t(card.quiet)}{link}</p>"
        )
    parts.append('<hr style="border:0;border-top:1px solid #d0d5dd;margin:24px 0;">')
    if card.footer:
        parts.append(
            f'<p style="margin:0;font-size:13px;line-height:20px;color:#6b7280;">'
            f"{_t(card.footer)}</p>"
        )
    body = "".join(parts)
    return (
        "<!DOCTYPE html>"
        '<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="color-scheme" content="light">'
        '<meta name="supported-color-schemes" content="light">'
        f"<title>{title}</title></head>"
        f'<body style="margin:0;padding:0;background-color:{PAGE_BACKGROUND};">'
        '<div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;'
        f'font-size:1px;line-height:1px;color:{PAGE_BACKGROUND};">{preview}</div>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'border="0" bgcolor="{PAGE_BACKGROUND}" '
        f'style="background-color:{PAGE_BACKGROUND};"><tr>'
        '<td align="center" style="padding:32px 16px;">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        'border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;'
        'background-color:#ffffff;border-radius:8px;"><tr>'
        f'<td style="padding:32px 40px 32px;font-family:{_FONT};color:#374151;">'
        f"{body}</td></tr></table></td></tr></table></body></html>"
    )
