"""New-device recognition and the sign-in alert it triggers."""

import asyncio
from datetime import UTC, datetime

import pytest

from src.auth import devices
from src.auth.models import User
from src.email import EmailData
from src.email_config import email_settings

CHROME_WINDOWS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
CHROME_WINDOWS_UPDATED = CHROME_WINDOWS.replace("140.0.0.0", "141.0.0.0")
SAFARI_IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 "
    "Safari/604.1"
)


def _user(known: list[str] | None = None) -> User:
    return User(
        email="devices@example.com",
        username="devices",
        first_name="Device",
        last_name="Test",
        hashed_password="unused",
        known_device_keys=known if known is not None else [],
    )


def test_describe_device_names_browser_and_system() -> None:
    assert devices.describe_device(CHROME_WINDOWS) == "Chrome on Windows"
    assert devices.describe_device(SAFARI_IPHONE) == "Safari on iOS"
    assert devices.describe_device("Mozilla/5.0 Chrome/140 Edg/140") == "Edge"
    assert devices.describe_device(None) is None
    assert devices.describe_device("curl/8.0") is None


def test_first_device_is_recorded_without_a_warning() -> None:
    user = _user()
    assert devices.remember_device(user, CHROME_WINDOWS) is None
    assert user.known_device_keys == ["Chrome on Windows"]


def test_browser_updates_are_not_a_new_device() -> None:
    user = _user(["Chrome on Windows"])
    assert devices.remember_device(user, CHROME_WINDOWS_UPDATED) is None
    assert user.known_device_keys == ["Chrome on Windows"]


def test_a_new_device_is_reported_and_remembered() -> None:
    user = _user(["Chrome on Windows"])
    assert devices.remember_device(user, SAFARI_IPHONE) == "Safari on iOS"
    assert user.known_device_keys == ["Chrome on Windows", "Safari on iOS"]
    assert devices.remember_device(user, SAFARI_IPHONE) is None


def test_unrecognisable_agents_are_ignored() -> None:
    user = _user(["Chrome on Windows"])
    assert devices.remember_device(user, None) is None
    assert devices.remember_device(user, "curl/8.0") is None
    assert user.known_device_keys == ["Chrome on Windows"]


def test_known_devices_are_capped() -> None:
    user = _user([f"Device {n}" for n in range(devices.MAX_KNOWN_DEVICES)])
    devices.remember_device(user, SAFARI_IPHONE)
    assert len(user.known_device_keys) == devices.MAX_KNOWN_DEVICES
    assert user.known_device_keys[-1] == "Safari on iOS"
    assert "Device 0" not in user.known_device_keys


@pytest.mark.asyncio
async def test_alert_is_sent_in_the_background(
    monkeypatch: pytest.MonkeyPatch, auth_emails: list[dict[str, str]]
) -> None:
    monkeypatch.setattr(
        type(email_settings), "emails_enabled", property(lambda _self: True)
    )
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    devices.schedule_new_sign_in_alert(
        email_to="devices@example.com",
        device="Safari on iOS",
        ip_address="203.0.113.7",
        signed_in_at=datetime(2026, 9, 23, 14, 5, tzinfo=UTC),
    )
    await asyncio.gather(*devices._pending_alerts)  # noqa: SLF001 - drain for the test
    [message] = auth_emails
    assert message["email_to"] == "devices@example.com"
    assert message["subject"] == "New sign-in from Safari on iOS"
    assert "203.0.113.7" in message["html_content"]
    assert "23 Sep 2026 at 14:05 UTC" in message["html_content"]


@pytest.mark.asyncio
async def test_alert_failure_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def broken(**_kwargs: object) -> EmailData:
        raise RuntimeError("render down")

    monkeypatch.setattr(devices, "_new_sign_in_email", broken)
    await devices._send_new_sign_in_alert(  # noqa: SLF001 - exercising the guard
        email_to="devices@example.com",
        device="Safari on iOS",
        ip_address=None,
        signed_in_at=datetime(2026, 9, 23, tzinfo=UTC),
    )


def test_no_alert_without_email_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        type(email_settings), "emails_enabled", property(lambda _self: False)
    )
    devices.schedule_new_sign_in_alert(
        email_to="devices@example.com",
        device="Safari on iOS",
        ip_address=None,
        signed_in_at=datetime(2026, 9, 23, tzinfo=UTC),
    )
    assert not devices._pending_alerts  # noqa: SLF001
