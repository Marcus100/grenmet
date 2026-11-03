"""Save-time guards for CAP feed URLs and CAP settings, plus the settings audit trail.

Feed URLs are refused at save with one generic 422 (no host detail echoed). The
ingest path's last_error holds a generic class message; the detail goes to the log.
Settings ``web`` must be an https address and ``contact`` plain text. The settings
audit payload records changed field names and values, masking the signing reference.
"""

import logging
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from defusedxml import ElementTree as DefusedET
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import admin_lists, validation
from src.cap import service as cap_service
from src.cap.exceptions import CapFeedUrlError
from src.cap.models import (
    CapAuditEvent,
    CapCategory,
    CapCertainty,
    CapFeedImport,
    CapIntegrationStatus,
    CapLifecycleState,
    CapMessageType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)
from src.cap.schemas import (
    CapAlertPublic,
    CapFeedImportCreate,
    CapFeedImportUpdate,
    CapInfoPublic,
    CapSettingsUpdate,
)
from src.cap.xml import alert_to_cap_xml
from tests.factories import make_user

GOOD_FEED = "https://feeds.test/cap.rss"

BAD_FEED_URLS = [
    "http://feeds.test/cap.rss",  # not https
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://feeds.test/cap.rss",
    "https://user:secret@feeds.test/cap.rss",  # credentials
    "https://user@feeds.test/cap.rss",
    "https://:443/cap.rss",  # empty host
    "https://127.0.0.1/cap.rss",  # loopback literal
    "https://10.0.0.5/cap.rss",  # private literal
    "https://169.254.169.254/latest",  # link-local metadata address
    "https://[::1]/cap.rss",  # IPv6 loopback
    "https://[::ffff:127.0.0.1]/cap.rss",  # IPv4-mapped loopback
    "https://localhost/cap.rss",
    "https://printer.internal/cap.rss",
    "https://feeds.test/cap rss",  # whitespace
    "https://feeds.test/\x00cap.rss",  # control character
    "https://[::1/cap.rss",  # malformed IPv6 literal
]


@pytest.mark.parametrize("url", BAD_FEED_URLS)
async def test_a_bad_feed_url_is_refused_at_create_with_a_generic_422(
    db_async: AsyncSession, url: str
) -> None:
    su = await make_user(db_async, superuser=True)
    with pytest.raises(CapFeedUrlError) as info:
        await cap_service.create_feed(
            session=db_async,
            current_user=su,
            payload=CapFeedImportCreate(name="x", url=url),
        )
    assert info.value.status_code == 422
    message = str(info.value)
    assert message == (
        "Feed URL must be an https address on a public host, "
        "with no username or password."
    )
    for leaked in ("127.0.0.1", "10.0.0.5", "localhost", "internal", "secret"):
        assert leaked not in message


@pytest.mark.parametrize("url", BAD_FEED_URLS)
async def test_a_bad_feed_url_is_refused_at_update_and_the_row_is_unchanged(
    db_async: AsyncSession, url: str
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = CapFeedImport(name="GD peer", url=GOOD_FEED)
    db_async.add(feed)
    await db_async.commit()
    await db_async.refresh(feed)

    with pytest.raises(CapFeedUrlError):
        await cap_service.update_feed(
            session=db_async,
            current_user=su,
            feed_id=feed.id,
            payload=CapFeedImportUpdate(url=url),
        )
    await db_async.refresh(feed)
    assert feed.url == GOOD_FEED


async def test_a_good_feed_url_is_accepted_at_create_and_update(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = await cap_service.create_feed(
        session=db_async,
        current_user=su,
        payload=CapFeedImportCreate(name="GD peer", url=GOOD_FEED),
    )
    renamed = await cap_service.update_feed(
        session=db_async,
        current_user=su,
        feed_id=feed.id,
        payload=CapFeedImportUpdate(url="https://peer.example.org/feed.xml"),
    )
    assert renamed.url == "https://peer.example.org/feed.xml"


async def test_a_name_only_update_skips_the_url_check(db_async: AsyncSession) -> None:
    su = await make_user(db_async, superuser=True)
    feed = CapFeedImport(name="old", url="http://legacy.example.org/feed.xml")
    db_async.add(feed)
    await db_async.commit()
    updated = await cap_service.update_feed(
        session=db_async,
        current_user=su,
        feed_id=feed.id,
        payload=CapFeedImportUpdate(name="new"),
    )
    assert updated.name == "new"


async def test_the_save_check_does_no_dns_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def no_lookup(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("DNS must not run at save time")

    monkeypatch.setattr(validation.socket, "getaddrinfo", no_lookup)
    validation.validate_feed_url("https://feeds.test/cap.rss")


@pytest.fixture
def _allow_test_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    async def allowed(_host: str) -> None:
        return None

    monkeypatch.setattr(cap_service, "ensure_public_host", allowed)


async def test_a_refused_host_records_a_generic_last_error_and_logs_the_detail(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(
        cap_service, "ensure_public_host", validation.ensure_public_host
    )
    su = await make_user(db_async, superuser=True)
    feed = CapFeedImport(name="GD peer", url="https://no-such-host.invalid/cap.rss")
    db_async.add(feed)
    await db_async.commit()

    def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request may be made")

    cap_service.logger.disabled = False
    with caplog.at_level(logging.WARNING, logger=cap_service.logger.name):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await cap_service.ingest_feed(
                session=db_async, feed=feed, system_user=su, http_client=client
            )

    assert feed.last_error == "host refused"
    assert "no-such-host.invalid" not in feed.last_error
    details = [getattr(record, "detail", "") for record in caplog.records]
    assert any("could not resolve" in detail for detail in details)
    assert "no-such-host.invalid" not in caplog.records[0].getMessage()


async def test_a_fetch_failure_records_a_generic_last_error(
    db_async: AsyncSession, _allow_test_hosts: None
) -> None:
    su = await make_user(db_async, superuser=True)
    feed = CapFeedImport(name="GD peer", url=GOOD_FEED)
    db_async.add(feed)
    await db_async.commit()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await cap_service.ingest_feed(
            session=db_async, feed=feed, system_user=su, http_client=client
        )
    assert feed.last_error == "could not fetch"


async def test_an_unexpected_ingest_error_records_a_generic_last_error(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await make_user(db_async, superuser=True)
    feed = CapFeedImport(
        name="GD peer", url=GOOD_FEED, status=CapIntegrationStatus.ACTIVE
    )
    db_async.add(feed)
    await db_async.commit()

    async def boom(**_kwargs: object) -> None:
        raise RuntimeError("socket to 10.9.8.7 reset")

    monkeypatch.setattr(cap_service, "ingest_feed", boom)
    await cap_service.ingest_all_active_feeds(session=db_async, http_client=None)
    await db_async.refresh(feed)
    assert feed.last_error == "ingest failed"
    assert "10.9.8.7" not in feed.last_error


# --------------------------------------------------------------------------- #
# Settings: web (https address) and contact (plain text)
# --------------------------------------------------------------------------- #

BAD_WEB = [
    "http://gms.gd",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,hi",
    "https://",
    "https://user:pw@gms.gd",
    "https://gms.gd/a b",
    'https://gms.gd/"x',
    "https://gms.gd/<b>",
    "https://gms.gd:notaport",
    "https://[::1/x",
    "https://gms.gd/" + "a" * 500,  # over 500 characters
]


@pytest.mark.parametrize("value", BAD_WEB)
def test_a_settings_web_address_must_be_https(value: str) -> None:
    with pytest.raises(ValidationError):
        CapSettingsUpdate(web=value)


@pytest.mark.parametrize(
    "value", ["https://www.gms.gd", "https://gms.gd/forecasts?lang=en"]
)
def test_a_settings_web_address_that_is_https_is_kept(value: str) -> None:
    assert CapSettingsUpdate(web=value).web == value


def test_an_empty_settings_web_clears_it() -> None:
    assert CapSettingsUpdate(web="").web is None
    assert CapSettingsUpdate(web="   ").web is None
    assert CapSettingsUpdate(web=None).web is None


BAD_CONTACT = [
    "Duty desk\n555-0100",
    "Duty\rdesk",
    "tab\there",
    "nul\x00byte",
    "del\x7fchar",
    "<script>alert(1)</script>",
    "duty@gms.gd>",
    "x" * 501,
]


@pytest.mark.parametrize("value", BAD_CONTACT)
def test_a_settings_contact_must_be_plain_text(value: str) -> None:
    with pytest.raises(ValidationError):
        CapSettingsUpdate(contact=value)


@pytest.mark.parametrize(
    "value",
    [
        "duty@gms.gd",
        "+1 473 555 0100",
        'Duty & Ops "night" desk (GMS)',
        "GMS Duty Forecaster, Ext. 210",
    ],
)
def test_a_settings_contact_that_is_plain_text_is_kept(value: str) -> None:
    assert CapSettingsUpdate(contact=value).contact == value


def test_an_empty_settings_contact_clears_it() -> None:
    assert CapSettingsUpdate(contact="  ").contact is None


async def test_the_settings_route_refuses_an_unsafe_web_with_422(
    async_client: httpx.AsyncClient, superuser_token_headers_async: dict[str, str]
) -> None:
    resp = await async_client.patch(
        "/api/v1/cap/settings",
        headers=superuser_token_headers_async,
        json={"web": "javascript:alert(1)"},
    )
    assert resp.status_code == 422, resp.text


# --------------------------------------------------------------------------- #
# Settings audit: changed field names and values, reference masked
# --------------------------------------------------------------------------- #


async def test_a_settings_change_is_audited_with_before_and_after(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    await admin_lists.get_or_create_settings(session=db_async)
    await admin_lists.update_settings(
        session=db_async,
        current_user=su,
        payload=CapSettingsUpdate(
            web="https://gms.gd",
            signing_certificate_ref="vault://cap/signing-cert-2026",
        ),
    )
    event = (
        (
            await db_async.execute(
                select(CapAuditEvent)
                .where(CapAuditEvent.action == "settings.update")
                .order_by(CapAuditEvent.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    assert event is not None
    changes = {change["field"]: change for change in event.payload["changes"]}
    assert set(changes) == {"web", "signing_certificate_ref"}
    assert changes["web"]["old"] is None
    assert changes["web"]["new"] == "https://gms.gd"
    assert changes["web"]["sensitive"] is False
    cert = changes["signing_certificate_ref"]
    assert cert["sensitive"] is True
    assert cert["masked"] is True
    assert "vault://" not in str(event.payload)


async def test_an_unchanged_field_is_not_in_the_settings_audit(
    db_async: AsyncSession,
) -> None:
    su = await make_user(db_async, superuser=True)
    settings = await admin_lists.get_or_create_settings(session=db_async)
    settings.contact = "duty@gms.gd"
    await db_async.commit()
    await admin_lists.update_settings(
        session=db_async,
        current_user=su,
        payload=CapSettingsUpdate(contact="duty@gms.gd", feed_limit=50),
    )
    event = (
        (
            await db_async.execute(
                select(CapAuditEvent)
                .where(CapAuditEvent.action == "settings.update")
                .order_by(CapAuditEvent.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    assert event is not None
    fields = [change["field"] for change in event.payload["changes"]]
    assert fields == ["feed_limit"]


# --------------------------------------------------------------------------- #
# XML escaping of settings-derived text
# --------------------------------------------------------------------------- #


def _alert_with(contact: str, web: str) -> CapAlertPublic:
    now = datetime.now(UTC)
    info = CapInfoPublic(
        id=uuid4(),
        sequence=0,
        language="en",
        categories=[CapCategory.MET],
        event="Heavy Rainfall",
        urgency=CapUrgency.EXPECTED,
        severity=CapSeverity.SEVERE,
        certainty=CapCertainty.LIKELY,
        effective=now,
        onset=now + timedelta(minutes=30),
        expires=now + timedelta(hours=3),
        headline="Heavy rain",
        description="Heavy rain expected.",
        contact=contact,
        web=web,
    )
    return CapAlertPublic(
        id=uuid4(),
        identifier="urn:test:escape-1",
        sender="gms@gms.gd",
        sent=now,
        status=CapStatus.ACTUAL,
        msg_type=CapMessageType.ALERT,
        scope=CapScope.PUBLIC,
        lifecycle_state=CapLifecycleState.PUBLISHED,
        created_by_user_id=uuid4(),
        info=[info],
        created_at=now,
        updated_at=now,
    )


def test_cap_xml_escapes_contact_and_web_text() -> None:
    contact = 'Duty & Ops <night> "desk"'
    web = "https://gms.gd/forecasts?a=1&b=2"
    xml = alert_to_cap_xml(_alert_with(contact, web))

    assert "<night>" not in xml
    assert "&amp;" in xml
    parsed = DefusedET.fromstring(xml)
    ns = {"cap": "urn:oasis:names:tc:emergency:cap:1.2"}
    assert parsed.find("cap:info/cap:contact", ns).text == contact
    assert parsed.find("cap:info/cap:web", ns).text == web
