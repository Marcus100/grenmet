import logging
import re
import smtplib
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path
from typing import Any, NamedTuple

import httpx
import jwt
import resend
from jinja2 import Template
from jwt.exceptions import InvalidTokenError
from resend.exceptions import ResendError

from src import provider_health
from src.auth.config import auth_settings
from src.config import settings
from src.email_config import email_settings

logger = logging.getLogger(__name__)

# A hung SMTP server must not hold a caller (and any lock it holds) indefinitely.
SMTP_TIMEOUT_SECONDS = 10.0
# Other React Email renders; the card path passes a shorter timeout (email_layout).
RENDER_TIMEOUT_SECONDS = 10.0

#: Suffix for business mail: "<Business> via Barrels".
VIA_SUFFIX = " via Barrels"
MAX_DISPLAY_NAME = 60
MAX_REPLY_TO = 254
# Characters a display name may not keep: angle brackets and quotes (header
# syntax), backslash (escape), and "@" (a name must not look like an address).
_NAME_BANNED = '<>"\\@'
#: Business names containing any of these (case-insensitive, after the folding
#: below) are not used as the sender name: they would let a business pass as
#: Barrels, a government body, a bank or a support desk, or carry a web address.
#: The sender then keeps the default name. Names are folded (lookalikes, digit
#: substitutions) and split into words. A short term (3 letters, "gaa") must be
#: whole words, or end a word, or start one followed only by digits, a plural or an
#: official word: "GAA Spa", "G A A", "MyGMS", "GAAs" and "GAAOfficial" are
#: caught, "Gaanesh" and "Yoga Academy" are not. A longer term is caught inside one word ("BarrelsSpa", "Barre1s") or
#: from the start of a word across the next ones ("Bar rels", "Met Office"), but
#: not when it only straddles two unrelated words ("Rad Minimart"). A dotted term
#: ("spa.com") is matched with spaces removed. Accepted: a long term inside a
#: word still matches ("Riverbank Cafe" keeps the default name); the fallback is safe.
RESERVED_SENDER_TERMS = (
    "barrels",
    "gaa",
    "grenada airport",
    "gms",
    "met office",
    "met service",
    "meteorological",
    "official weather",
    "weather service",
    "government",
    "bank",
    "support",
    "security",
    "admin",
    "http",
    "www",
    ".com",
    ".gd",
)
# Lookalike letters (Cyrillic and Greek) folded to the Latin letter they resemble.
_CONFUSABLES = str.maketrans(
    {
        "а": "a",
        "в": "b",
        "с": "c",
        "е": "e",
        "һ": "h",
        "і": "i",
        "ј": "j",
        "к": "k",
        "м": "m",
        "н": "h",
        "о": "o",
        "р": "p",
        "ԁ": "d",
        "ԛ": "q",
        "ѕ": "s",
        "т": "t",
        "у": "y",
        "х": "x",
        "α": "a",
        "ε": "e",
        "ι": "i",
        "κ": "k",
        "ν": "v",
        "ο": "o",
        "ρ": "p",
        "τ": "t",
        "υ": "u",
        "χ": "x",
        # Latin dotless i and Cyrillic palochka.
        "ı": "i",
        "ӏ": "l",
    }
)
_SHORT_TERM = 3
_WORD_BREAK = re.compile(r"[^\w]+|_+")
# What may follow a short term inside one word and still read as that body:
# digits, a plural, another short term, or an official-sounding word.
_SHORT_TERM_TAIL = re.compile(
    r"[0-9]+|s|gaa|gms|official|gov|govt|grenada|gd|weather|met|jam|team|staff|hq"
    r"|news|jobs|info|online|ltd|alerts|updates"
)
# Digits that stand in for letters. "1" reads as l or i, so both are tried.
_DIGIT_LETTERS = {"0": "o", "3": "e", "5": "s"}


def _fold(value: str) -> str:
    """Lower-case text with compatibility forms, accents, format characters
    (zero-width and soft hyphen) and lookalike letters folded away. Spaces and
    punctuation are kept."""
    text = unicodedata.normalize("NFKC", value)
    text = unicodedata.normalize("NFKD", text)
    kept = "".join(
        char for char in text if unicodedata.category(char) not in ("Cf", "Mn")
    )
    return kept.casefold().translate(_CONFUSABLES)


def _squashed(folded: str, one: str) -> str:
    """Letters and digits only, with digits read as letters and "1" as ``one``."""
    chars = []
    for char in folded.replace("1", one):
        char = _DIGIT_LETTERS.get(char, char)
        if "a" <= char <= "z" or "0" <= char <= "9":
            chars.append(char)
    return "".join(chars)


def _words(folded: str, one: str) -> list[str]:
    """The folded name split into squashed words, empty words dropped."""
    return [
        word for part in _WORD_BREAK.split(folded) if (word := _squashed(part, one))
    ]


def _short_term_in_word(term: str, word: str) -> bool:
    """A short term inside one word: the whole word, its end ("theGAA", "MyGMS"),
    or its start followed only by digits, a plural or another official word
    ("GAAs", "GAA2", "GAAOfficial"). "Gaanesh" is not caught."""
    if word.endswith(term):
        return True
    return word.startswith(term) and bool(_SHORT_TERM_TAIL.fullmatch(word[len(term) :]))


def _term_in_words(term: str, words: list[str]) -> bool:
    """Whether a squashed ``term`` appears in ``words`` under the word rules above."""
    if len(term) <= _SHORT_TERM and any(
        _short_term_in_word(term, word) for word in words
    ):
        return True
    joined = "".join(words)
    starts, ends, offset = [], set(), 0
    for word in words:
        starts.append(offset)
        offset += len(word)
        ends.add(offset)
    for start in starts:
        if not joined.startswith(term, start):
            continue
        if len(term) > _SHORT_TERM or start + len(term) in ends:
            return True
    return len(term) > _SHORT_TERM and any(term in word for word in words)


def _raw_words(folded: str) -> list[str]:
    """The folded name split into words of plain letters and digits, digits kept
    as digits (so "GMS1" keeps its 1)."""
    return [
        word
        for part in _WORD_BREAK.split(folded)
        if (word := re.sub(r"[^a-z0-9]", "", part))
    ]


def _is_reserved(name: str) -> bool:
    # A capital I is also read as l ("BarreIs"); casefolding alone would make it i.
    variants = {_fold(name), _fold(name.replace("I", "l"))}
    for folded in variants:
        spaced_out = re.sub(r"\s", "", folded)
        word_forms = [_words(folded, "l"), _words(folded, "i"), _raw_words(folded)]
        for term in RESERVED_SENDER_TERMS:
            if "." in term:
                if term in spaced_out:
                    return True
            elif any(
                _term_in_words(_squashed(term, "l"), words) for words in word_forms
            ):
                return True
    return False


_REPLY_TO = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")


@dataclass
class EmailData:
    html_content: str
    subject: str
    #: The plain-text part, when the render service sends one.
    text_content: str | None = None


class SenderIdentity(NamedTuple):
    """The display name and Reply-To a business mail carries. ``None`` keeps the
    configured sender (the From address is never changed)."""

    from_name: str | None = None
    reply_to: str | None = None


# ── Sender identity ───────────────────────────────────────────────────────────


def _display_name(value: str | None, limit: int = MAX_DISPLAY_NAME) -> str:
    """``value`` as a safe display name: control and format characters, angle
    brackets, quotes, backslash and "@" become spaces; whitespace is collapsed and
    the length capped. Business-controlled text goes through here."""
    spaced = "".join(
        " " if unicodedata.category(char)[0] == "C" or char in _NAME_BANNED else char
        for char in value or ""
    )
    collapsed = " ".join(spaced.split())
    # An RFC 2047 encoded word (=?charset?enc?text?=) in a name would be decoded
    # by mail apps into text they show as a sender; a space breaks the marker.
    neutral = collapsed.replace("=?", "= ?").replace("?=", "? =")
    return neutral[:limit].strip()


def sender_header(from_name: str | None) -> str:
    """The From header: the cleaned name, or the configured default when none is
    given, with the verified sending address. ``formataddr`` quotes the name
    where it must be, so no name can add a header or a second address."""
    name = _display_name(from_name)
    if not name:
        # The configured default is used verbatim, as before: it is our own
        # setting, not business text, so it is not cleaned or re-quoted.
        return f"{email_settings.EMAILS_FROM_NAME} <{email_settings.EMAILS_FROM_EMAIL}>"
    return formataddr((name, str(email_settings.EMAILS_FROM_EMAIL)))


def business_sender_name(business: str) -> str:
    """The display name "<Business> via Barrels". The business part is cut so the
    suffix survives. Empty when the business has no usable name, or when its name
    holds a reserved term (the default sender is used instead)."""
    base = _display_name(business, MAX_DISPLAY_NAME - len(VIA_SUFFIX))
    if not base:
        return ""
    if _is_reserved(base):
        logger.warning("Business name not used as sender: reserved term")
        return ""
    return f"{base}{VIA_SUFFIX}"


def safe_reply_to(value: str | None) -> str | None:
    """``value`` when it is one plain email address, else None. A rejected value is
    logged without the address."""
    candidate = (value or "").strip()
    if (
        not candidate
        or len(candidate) > MAX_REPLY_TO
        or not _REPLY_TO.fullmatch(candidate)
    ):
        if candidate:
            logger.warning("Reply-To rejected: not a plain email address")
        return None
    return candidate


# ── Sending ───────────────────────────────────────────────────────────────────


def send_email(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
    headers: dict[str, str] | None = None,
    text_content: str | None = None,
    from_name: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Send an email via Resend (primary) or SMTP fallback (local dev / Mailpit).

    Resend is used when ``RESEND_API_KEY`` is configured.
    SMTP is the fallback for local development with Mailpit.
    ``headers`` adds extra message headers (list mail: ``List-Unsubscribe``).
    ``text_content`` is an optional plain-text part sent beside the HTML; without
    it the message is HTML only, as before. ``from_name`` replaces the sender's
    display name and ``reply_to`` sets the Reply-To address (both optional; the
    defaults are the configured sender).
    """
    if not email_settings.emails_enabled:
        raise RuntimeError(
            "Email is not configured: set RESEND_API_KEY or SMTP_HOST + EMAILS_FROM_EMAIL"
        )
    # Never log a subject: the sign-in code email's subject starts with the code.

    from_address = sender_header(from_name)
    reply = safe_reply_to(reply_to)

    # ── Resend (production / staging) ──────────────────────────────────────────
    if email_settings.RESEND_API_KEY:
        resend.api_key = email_settings.RESEND_API_KEY
        params: resend.Emails.SendParams = {
            "from": from_address,
            "to": [email_to],
            "subject": subject,
            "html": html_content,
        }
        if headers:
            params["headers"] = dict(headers)
        if text_content:
            params["text"] = text_content
        if reply:
            params["reply_to"] = reply
        with provider_health.watch(
            "resend", "send", errors=(ResendError, httpx.HTTPError, OSError)
        ):
            result = resend.Emails.send(params)
        logger.info("Email sent via Resend to %s (id=%s)", email_to, result.get("id"))
        return

    # ── SMTP fallback (local dev / Mailpit) ────────────────────────────────────
    if not email_settings.SMTP_HOST or not email_settings.SMTP_PORT:
        raise ValueError(
            "No email provider configured: set RESEND_API_KEY or SMTP_HOST"
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_address
    msg["To"] = email_to
    if reply:
        msg["Reply-To"] = reply
    for name, value in (headers or {}).items():
        msg[name] = value
    if text_content:
        msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    if email_settings.SMTP_SSL:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            email_settings.SMTP_HOST,
            email_settings.SMTP_PORT,
            timeout=SMTP_TIMEOUT_SECONDS,
        )
    else:
        server = smtplib.SMTP(
            email_settings.SMTP_HOST,
            email_settings.SMTP_PORT,
            timeout=SMTP_TIMEOUT_SECONDS,
        )
        if email_settings.SMTP_TLS:
            server.starttls()

    if (
        email_settings.SMTP_USER
        and email_settings.SMTP_PASSWORD
        and email_settings.SMTP_HOST != "mailcatcher"
    ):
        server.login(email_settings.SMTP_USER, email_settings.SMTP_PASSWORD)

    server.send_message(msg)
    server.quit()
    logger.info("Email sent via SMTP to %s", email_to)


# ── React Email remote rendering ──────────────────────────────────────────────


async def render_remote(
    template: str,
    props: dict[str, Any],
    *,
    timeout_seconds: float = RENDER_TIMEOUT_SECONDS,
) -> EmailData:
    """Call the web-auth Next.js render endpoint to get React Email HTML.

    ``timeout_seconds`` bounds the call in seconds. Raises httpx.HTTPStatusError on
    non-2xx responses.
    """
    if not email_settings.EMAIL_RENDER_URL:
        raise RuntimeError("EMAIL_RENDER_URL is not configured")

    url = f"{email_settings.EMAIL_RENDER_URL.rstrip('/')}/api/email/render"
    headers = {"x-email-render-secret": email_settings.EMAIL_RENDER_SECRET or ""}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            json={"template": template, "props": props},
            headers=headers,
            timeout=timeout_seconds,
        )
        response.raise_for_status()

    data = response.json()
    return EmailData(
        html_content=data["html"],
        subject=data["subject"],
        text_content=data.get("text"),
    )


# ── Jinja2 fallback ───────────────────────────────────────────────────────────


def _render_jinja2(*, template_name: str, context: dict[str, Any]) -> str:
    """Render a Jinja2 HTML email template from the email-templates/build directory."""
    template_str = (
        Path(__file__).parent.parent / "email-templates" / "build" / template_name
    ).read_text()
    return str(Template(template_str).render(context))


# Keep the old name available for any code that imports it directly.
render_email_template = _render_jinja2


# ── Token helpers ─────────────────────────────────────────────────────────────


def generate_password_reset_token(email: str) -> str:
    """Generate a signed JWT for password reset."""
    delta = timedelta(hours=email_settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(UTC)
    expires = now + delta
    return jwt.encode(
        {"exp": expires.timestamp(), "nbf": now, "sub": email},
        auth_settings.SECRET_KEY,
        algorithm="HS256",
    )


def verify_password_reset_token(token: str) -> str | None:
    """Verify a password-reset JWT and return the email subject, or None if invalid."""
    try:
        decoded_token = jwt.decode(
            token, auth_settings.SECRET_KEY, algorithms=["HS256"]
        )
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None


# ── Email generators ──────────────────────────────────────────────────────────


def generate_test_email(email_to: str) -> EmailData:
    """Generate a test email payload (always uses Jinja2)."""
    subject = f"{settings.PROJECT_NAME} - Test email"
    html_content = _render_jinja2(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


async def generate_reset_password_email(
    email_to: str, email: str, token: str
) -> EmailData:
    """Generate a password reset email.

    Uses React Email (via the web-auth render endpoint) when EMAIL_RENDER_URL is
    configured; falls back to the Jinja2 template for local dev without the
    render service.
    """
    base = settings.FRONTEND_HOST or ""
    reset_link = f"{base.rstrip('/')}/reset-password?token={token}" if base else ""

    if email_settings.EMAIL_RENDER_URL:
        try:
            return await render_remote(
                "reset-password",
                {
                    "projectName": settings.PROJECT_NAME,
                    "username": email,
                    "resetLink": reset_link,
                    "validHours": email_settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
                },
            )
        except Exception:
            logger.exception(
                "React Email render failed for reset-password, falling back to Jinja2"
            )

    # Jinja2 fallback
    subject = f"{settings.PROJECT_NAME} - Password recovery for user {email}"
    html_content = _render_jinja2(
        template_name="reset_password.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": email,
            "email": email_to,
            "valid_hours": email_settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": reset_link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


async def generate_new_account_email(
    email_to: str, username: str, first_name: str = ""
) -> EmailData:
    """Generate a welcome / new-account email.

    Uses React Email when EMAIL_RENDER_URL is configured; falls back to Jinja2.
    ``first_name`` is used in the React Email greeting; it defaults to ``username``
    when not supplied (e.g. when called from the superuser-only create-user endpoint).
    """
    base = settings.FRONTEND_HOST or ""
    sign_in_link = base.rstrip("/") if base else ""

    if email_settings.EMAIL_RENDER_URL:
        try:
            return await render_remote(
                "welcome",
                {
                    "projectName": settings.PROJECT_NAME,
                    "firstName": first_name or username,
                    "username": username,
                    "email": email_to,
                    "signInLink": sign_in_link,
                },
            )
        except Exception:
            logger.exception(
                "React Email render failed for welcome, falling back to Jinja2"
            )

    # Jinja2 fallback
    subject = f"{settings.PROJECT_NAME} - New account for user {username}"
    html_content = _render_jinja2(
        template_name="new_account.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "email": email_to,
            "link": sign_in_link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)
