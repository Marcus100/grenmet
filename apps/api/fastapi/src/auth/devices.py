"""Recognise the devices a user signs in from and warn them about new ones.

A device is identified by its browser and operating-system family, not the raw
user agent, so routine browser updates don't look like a new device. IP
addresses are left out on purpose: they change on every mobile network hop.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime

from src.auth.models import User
from src.config import settings
from src.email import EmailData, _render_jinja2, _render_remote, send_email
from src.email_config import email_settings

logger = logging.getLogger(__name__)

# Keep enough history for a phone, a laptop and a few shared machines.
MAX_KNOWN_DEVICES = 20

_BROWSERS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"Edg/"), "Edge"),
    (re.compile(r"OPR/|Opera"), "Opera"),
    (re.compile(r"Firefox/"), "Firefox"),
    (re.compile(r"Chrome/|CriOS/"), "Chrome"),
    (re.compile(r"Safari/"), "Safari"),
)
_SYSTEMS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"iPhone|iPad|iPod"), "iOS"),
    (re.compile(r"Android"), "Android"),
    (re.compile(r"Windows"), "Windows"),
    (re.compile(r"Mac OS X|Macintosh"), "macOS"),
    (re.compile(r"CrOS"), "ChromeOS"),
    (re.compile(r"Linux"), "Linux"),
)

# Strong references so scheduled alerts aren't garbage-collected mid-send.
_pending_alerts: set[asyncio.Task[None]] = set()


def _first_match(
    table: tuple[tuple[re.Pattern[str], str], ...], value: str
) -> str | None:
    for pattern, name in table:
        if pattern.search(value):
            return name
    return None


def describe_device(user_agent: str | None) -> str | None:
    """ "Chrome on Windows", or None when the user agent says nothing useful."""
    if not user_agent:
        return None
    browser = _first_match(_BROWSERS, user_agent)
    system = _first_match(_SYSTEMS, user_agent)
    if browser and system:
        return f"{browser} on {system}"
    return browser or system


def remember_device(user: User, user_agent: str | None) -> str | None:
    """Record the device on the user; return its description if it is new.

    The first device an account ever uses is recorded without a warning — there
    is nothing yet to compare it against. The caller commits the session.
    """
    device = describe_device(user_agent)
    if device is None:
        return None
    known = list(user.known_device_keys or [])
    if device in known:
        return None
    is_new = bool(known)
    user.known_device_keys = [*known, device][-MAX_KNOWN_DEVICES:]
    return device if is_new else None


async def _new_sign_in_email(
    *, device: str, ip_address: str | None, signed_in_at: datetime
) -> EmailData:
    base = (settings.FRONTEND_HOST or "").rstrip("/")
    sessions_url = f"{base}/sessions" if base else None
    when = signed_in_at.strftime("%d %b %Y at %H:%M UTC")
    where = f" from IP address {ip_address}" if ip_address else ""
    title = f"New sign-in from {device}"
    body = (
        f"Your account was signed in to on {device}{where} on {when}. "
        "If this was you, there's nothing to do. If not, sign that session out "
        "and change your password straight away."
    )
    if email_settings.EMAIL_RENDER_URL:
        try:
            return await _render_remote(
                "notification",
                {
                    "projectName": settings.PROJECT_NAME,
                    "title": title,
                    "body": body,
                    "linkUrl": sessions_url,
                },
            )
        except Exception:  # noqa: BLE001 - any render failure falls back to Jinja
            logger.warning("React Email render failed; using Jinja fallback")
    html = _render_jinja2(
        template_name="notification.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "title": title,
            "body": body,
            "link_url": sessions_url,
        },
    )
    return EmailData(html_content=html, subject=title)


async def _send_new_sign_in_alert(
    *, email_to: str, device: str, ip_address: str | None, signed_in_at: datetime
) -> None:
    try:
        message = await _new_sign_in_email(
            device=device, ip_address=ip_address, signed_in_at=signed_in_at
        )
        await asyncio.to_thread(
            send_email,
            email_to=email_to,
            subject=message.subject,
            html_content=message.html_content,
        )
    except Exception:  # noqa: BLE001 - an alert must never break sign-in
        logger.exception("New sign-in alert could not be sent")


def schedule_new_sign_in_alert(
    *, email_to: str, device: str, ip_address: str | None, signed_in_at: datetime
) -> None:
    """Send the warning in the background so sign-in never waits on email."""
    if not email_settings.emails_enabled:
        return
    task = asyncio.get_running_loop().create_task(
        _send_new_sign_in_alert(
            email_to=email_to,
            device=device,
            ip_address=ip_address,
            signed_in_at=signed_in_at,
        )
    )
    _pending_alerts.add(task)
    task.add_done_callback(_pending_alerts.discard)
