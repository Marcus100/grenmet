"""Non-conforming CAP XML is refused (422) at publish and import, and logged.

The corpus in ``test_cap_xsd_corpus.py`` shows that real shapes conform. These
cases show the other side: each mutation breaks one rule of the official CAP 1.2
schema, so the check must refuse it. A refused warning is never published, and a
refused import or feed entry is never stored.
"""

import logging
import uuid
from collections.abc import Callable

import httpx
import pytest
from lxml import etree
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.baseline.models import ApprovalPolicy
from src.cap import service as cap_service
from src.cap import xsd
from src.cap.exceptions import (
    CapImportError,
    CapNonConformingAlertError,
    CapSchemaValidationError,
    CapStateError,
)
from src.cap.models import CapAlert, CapFeedImport, CapLifecycleState, CapScope
from src.cap.schemas import (
    CapAlertAction,
    CapAlertCreate,
    CapAreaCreate,
    CapEmergencyPublish,
    CapPublishAction,
)
from src.cap.xml import alert_to_cap_xml
from src.cap.xsd import (
    cap_schema_errors,
    ensure_cap_schema,
    strip_illegal_xml_chars,
)
from tests.factories import make_user

from .test_cap_state_machine import _VALID_PAYLOAD_DICT, _publish_approved
from .test_cap_xsd_corpus import alert, info
from .test_feeds import _ENTRY_XML, FEED_URL, _feed_handler

CAP = "{urn:oasis:names:tc:emergency:cap:1.2}"
REFUSAL_LOG = "CAP XML refused by the CAP 1.2 schema"

Mutation = Callable[[etree._Element], None]


@pytest.fixture(autouse=True)
def _enabled_refusal_logger(monkeypatch: pytest.MonkeyPatch) -> None:
    # Alembic's fileConfig (run by the database bootstrap) disables loggers that
    # already exist, so re-enable ours to keep the log assertions order-independent.
    monkeypatch.setattr(xsd.logger, "disabled", False)
    monkeypatch.setattr(cap_service.logger, "disabled", False)


def _base_xml() -> bytes:
    return alert_to_cap_xml(alert(infos=[info()])).encode("utf-8")


def _find(root: etree._Element, path: str) -> etree._Element:
    found = root.find(path.replace("cap:", CAP))
    assert found is not None, path
    return found


def _set_text(path: str, text: str) -> Mutation:
    def apply(root: etree._Element) -> None:
        _find(root, path).text = text

    return apply


def _remove(parent: str, child: str) -> Mutation:
    def apply(root: etree._Element) -> None:
        _find(root, parent).remove(_find(root, f"{parent}/{child}"))

    return apply


def _insert_after(parent: str, after: str, name: str, text: str) -> Mutation:
    def apply(root: etree._Element) -> None:
        container = _find(root, parent)
        element = etree.Element(f"{CAP}{name}")
        element.text = text
        anchor = _find(root, f"{parent}/{after}")
        container.insert(list(container).index(anchor) + 1, element)

    return apply


def _append(parent: str, name: str, text: str) -> Mutation:
    def apply(root: etree._Element) -> None:
        element = etree.SubElement(_find(root, parent), f"{CAP}{name}")
        element.text = text

    return apply


def _resource(*fields: tuple[str, str]) -> Mutation:
    def apply(root: etree._Element) -> None:
        info_element = _find(root, "cap:info")
        resource = etree.Element(f"{CAP}resource")
        for name, text in fields:
            etree.SubElement(resource, f"{CAP}{name}").text = text
        # A resource sits before the areas in the sequence.
        info_element.insert(
            list(info_element).index(_find(root, "cap:info/cap:area")), resource
        )

    return apply


def _swap_children(first: str, second: str) -> Mutation:
    def apply(root: etree._Element) -> None:
        a, b = _find(root, first), _find(root, second)
        a_index, b_index = list(root).index(a), list(root).index(b)
        root[a_index], root[b_index] = b, a

    return apply


def _unknown_element(root: etree._Element) -> None:
    etree.SubElement(root, f"{CAP}forecaster").text = "x"


# Each mutation breaks one rule of the official schema.
MUTATIONS: dict[str, Mutation] = {
    "sent uses the Z designator": _set_text("cap:sent", "2026-10-30T12:00:00Z"),
    "sent has fractional seconds": _set_text("cap:sent", "2026-10-30T12:00:00.5-00:00"),
    "unknown status": _set_text("cap:status", "Real"),
    "unknown message type": _set_text("cap:msgType", "Notice"),
    "unknown scope": _set_text("cap:scope", "Global"),
    "unknown category": _set_text("cap:info/cap:category", "Weather"),
    "unknown severity": _set_text("cap:info/cap:severity", "Critical"),
    "unknown urgency": _set_text("cap:info/cap:urgency", "Now"),
    "unknown certainty": _set_text("cap:info/cap:certainty", "Sure"),
    "response type outside the enumeration": _insert_after(
        "cap:info", "cap:certainty", "responseType", "Hide"
    ),
    "info without an event": _remove("cap:info", "cap:event"),
    "info without an urgency": _remove("cap:info", "cap:urgency"),
    "area without an areaDesc": _remove("cap:info/cap:area", "cap:areaDesc"),
    "resource without a mimeType": _resource(("resourceDesc", "Bulletin")),
    "resource size is not an integer": _resource(
        ("resourceDesc", "Bulletin"), ("mimeType", "application/pdf"), ("size", "big")
    ),
    "altitude is not a decimal": _append("cap:info/cap:area", "altitude", "high"),
    "sender and identifier swapped": _swap_children("cap:identifier", "cap:sender"),
    "unknown element in the alert": _unknown_element,
}


def _mutated(name: str) -> bytes:
    root = etree.fromstring(_base_xml())
    MUTATIONS[name](root)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8")


def test_the_unmutated_document_conforms() -> None:
    assert cap_schema_errors(_base_xml()) == []


@pytest.mark.parametrize("name", list(MUTATIONS))
def test_a_document_breaking_one_schema_rule_is_refused(name: str) -> None:
    errors = cap_schema_errors(_mutated(name))

    assert errors, f"{name} was accepted"
    assert all(error.startswith("line ") for error in errors)
    assert len(errors) <= 5


def test_a_document_in_another_namespace_is_refused() -> None:
    other = _base_xml().replace(
        b'xmlns="urn:oasis:names:tc:emergency:cap:1.2"',
        b'xmlns="urn:example:not-cap"',
    )

    assert cap_schema_errors(other)


def test_refusal_raises_422_with_a_clear_message_and_logs_it(
    caplog: pytest.LogCaptureFixture,
) -> None:
    alert_id = uuid.uuid4()
    with caplog.at_level(logging.WARNING, logger="src.cap.xsd"):
        with pytest.raises(CapSchemaValidationError) as raised:
            ensure_cap_schema(
                _mutated("unknown severity"),
                action="publish",
                identifier="gms-test",
                alert_id=alert_id,
            )

    assert raised.value.status_code == 422
    assert "does not conform to the official CAP 1.2 schema" in raised.value.message
    refusals = [r for r in caplog.records if r.getMessage() == REFUSAL_LOG]
    assert len(refusals) == 1
    assert getattr(refusals[0], "action", None) == "publish"
    assert getattr(refusals[0], "identifier", None) == "gms-test"
    assert getattr(refusals[0], "alert_id", None) == str(alert_id)


def test_a_conforming_document_passes_the_check_without_logging(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.WARNING, logger="src.cap.xsd"):
        ensure_cap_schema(_base_xml(), action="publish")

    assert not [r for r in caplog.records if r.getMessage() == REFUSAL_LOG]


def test_schema_does_not_replace_the_rules_in_validation_py() -> None:
    """The schema cannot express schematron rules, such as a Restricted scope
    without a restriction. ``validation.py`` still enforces those, so the XSD
    accepting such a document is expected here."""
    restricted = alert_to_cap_xml(alert(scope=CapScope.RESTRICTED, restriction=None))

    assert cap_schema_errors(restricted) == []


_BAD_XML = _ENTRY_XML.replace(
    b"<severity>Moderate</severity>", b"<severity>Critical</severity>"
)
_DTD_XML = (
    b'<?xml version="1.0"?><!DOCTYPE alert [<!ENTITY x "y">]>'
    + _ENTRY_XML.split(b"?>", 1)[1]
)
_DTD_NO_ENTITY = (
    b'<?xml version="1.0"?><!DOCTYPE alert>' + _ENTRY_XML.split(b"?>", 1)[1]
)


async def test_import_stores_a_non_conforming_document_flagged_and_manual(
    db_async: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    user = await make_user(db_async, superuser=True)
    with caplog.at_level(logging.WARNING, logger="src.cap.service"):
        imported = await cap_service.import_alert(
            session=db_async,
            current_user=user,
            source="xml",
            value=_BAD_XML.decode("utf-8"),
        )

    assert imported.schema_conformant is False
    assert "Critical" in (imported.schema_error or "")
    assert imported.info[0].severity == "Unknown"  # stored as a neutral value
    assert imported.import_source == "manual"
    assert any(getattr(r, "identifier", None) == "FEED-001" for r in caplog.records)


async def test_a_flagged_import_needs_the_author_to_confirm_before_publishing(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    imported = await cap_service.import_alert(
        session=db_async,
        current_user=user,
        source="xml",
        value=_BAD_XML.decode("utf-8"),
    )

    with pytest.raises(CapStateError) as refused:
        await _publish_approved(
            session=db_async,
            current_user=user,
            alert_id=imported.id,
            payload=CapPublishAction(),
        )
    assert refused.value.status_code == 409


async def test_a_confirmed_import_publishes_what_we_now_hold(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    imported = await cap_service.import_alert(
        session=db_async,
        current_user=user,
        source="xml",
        value=_BAD_XML.decode("utf-8"),
    )

    published, _snapshot = await _publish_approved(
        session=db_async,
        current_user=user,
        alert_id=imported.id,
        payload=CapPublishAction(confirm_imported=True),
    )

    assert published.lifecycle_state == CapLifecycleState.PUBLISHED
    assert (
        published.schema_conformant is False
    )  # the flag stays: it was altered on import


async def test_an_emergency_publish_of_an_unconfirmed_import_is_also_refused(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    imported = await cap_service.import_alert(
        session=db_async,
        current_user=user,
        source="xml",
        value=_BAD_XML.decode("utf-8"),
    )

    with pytest.raises(CapStateError) as refused:
        await cap_service.emergency_publish_alert(
            session=db_async,
            current_user=user,
            alert_id=imported.id,
            payload=CapEmergencyPublish(reason="Real hazard"),
        )
    assert refused.value.status_code == 409


async def test_an_imported_non_conforming_alert_cannot_be_copied(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    imported = await cap_service.import_alert(
        session=db_async,
        current_user=user,
        source="xml",
        value=_BAD_XML.decode("utf-8"),
    )

    with pytest.raises(CapNonConformingAlertError):
        await cap_service.duplicate_alert(
            session=db_async, current_user=user, alert_id=imported.id
        )


async def test_import_api_stores_the_document_with_a_flag(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    resp = await async_client.post(
        "/api/v1/cap/alerts/import",
        headers=superuser_token_headers_async,
        json={"source": "xml", "value": _BAD_XML.decode("utf-8")},
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["schema_conformant"] is False
    assert "Critical" in body["schema_error"]
    assert body["import_source"] == "manual"
    stored = await db_async.execute(
        select(CapAlert).where(CapAlert.identifier == "FEED-001")
    )
    assert stored.scalars().first() is not None


async def test_import_refuses_a_document_with_a_dtd_with_or_without_entities(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    for doc in (_DTD_XML, _DTD_NO_ENTITY):
        resp = await async_client.post(
            "/api/v1/cap/alerts/import",
            headers=superuser_token_headers_async,
            json={"source": "xml", "value": doc.decode("utf-8")},
        )
        assert resp.status_code == 400, resp.text


async def test_import_keeps_400_for_malformed_xml(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    resp = await async_client.post(
        "/api/v1/cap/alerts/import",
        headers=superuser_token_headers_async,
        json={"source": "xml", "value": "<alert><identifier>"},
    )

    assert resp.status_code == 400, resp.text


async def test_a_deeply_nested_document_is_a_400_not_a_crash(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    deep = b"<alert>" + b"<a>" * 300 + b"</a>" * 300 + b"</alert>"
    with pytest.raises(CapImportError):
        await cap_service.import_alert(
            session=db_async, current_user=user, source="xml", value=deep.decode()
        )


async def test_feed_imports_a_non_conforming_entry_flagged_and_keeps_going(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    su: User = await make_user(db_async, superuser=True)
    row = CapFeedImport(name="GD peer", url=FEED_URL)
    db_async.add(row)
    await db_async.commit()
    await db_async.refresh(row)

    async def allowed(_host: str) -> None:
        return None

    monkeypatch.setattr(cap_service, "ensure_public_host", allowed)
    links = ["https://feeds.test/bad.xml", "https://feeds.test/good.xml"]
    bodies = {
        links[0]: _BAD_XML,
        links[1]: _ENTRY_XML.replace(b"FEED-001", b"FEED-GOOD"),
    }
    async with httpx.AsyncClient(transport=_feed_handler(links, bodies)) as client:
        result = await cap_service.ingest_feed(
            session=db_async, feed=row, system_user=su, http_client=client
        )

    assert result == {"created": 2, "skipped": 0}
    flagged = (
        (
            await db_async.execute(
                select(CapAlert).where(CapAlert.identifier == "FEED-001")
            )
        )
        .scalars()
        .first()
    )
    assert flagged is not None and flagged.schema_conformant is False
    assert flagged.import_source == "feed"
    clean = (
        (
            await db_async.execute(
                select(CapAlert).where(CapAlert.identifier == "FEED-GOOD")
            )
        )
        .scalars()
        .first()
    )
    assert clean is not None and clean.schema_conformant is True


async def test_a_feed_entry_with_a_dtd_is_still_skipped(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    su: User = await make_user(db_async, superuser=True)
    row = CapFeedImport(name="GD peer", url=FEED_URL)
    db_async.add(row)
    await db_async.commit()
    await db_async.refresh(row)

    async def allowed(_host: str) -> None:
        return None

    monkeypatch.setattr(cap_service, "ensure_public_host", allowed)
    links = ["https://feeds.test/dtd.xml"]
    async with httpx.AsyncClient(
        transport=_feed_handler(links, {links[0]: _DTD_XML})
    ) as client:
        result = await cap_service.ingest_feed(
            session=db_async, feed=row, system_user=su, http_client=client
        )

    assert result == {"created": 0, "skipped": 1}


async def test_the_save_time_checks_refuse_a_bad_value_before_it_is_stored(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    base = {**_VALID_PAYLOAD_DICT, "info": [{**_VALID_PAYLOAD_DICT["info"][0]}]}
    cases = {
        "responseType": {"response_types": ["Hide"]},
        "language": {"language": "en_GB"},
        "web": {"web": "https://example.test/a page"},
    }
    for label, change in cases.items():
        payload = {**base, "info": [{**base["info"][0], **change}]}
        resp = await async_client.post(
            "/api/v1/cap/alerts", headers=superuser_token_headers_async, json=payload
        )
        assert resp.status_code == 422, (label, resp.text)
        assert label in resp.text or label.lower() in resp.text.lower(), resp.text

    valid = {
        **base,
        "info": [
            {
                **base["info"][0],
                "response_types": ["Prepare"],
                "web": "https://example.test/gms",
            }
        ],
    }
    resp = await async_client.post(
        "/api/v1/cap/alerts", headers=superuser_token_headers_async, json=valid
    )
    assert resp.status_code == 201, resp.text


# ── Item 1: characters XML cannot carry are refused on save, not at publish ─────


def test_a_control_character_in_warning_text_is_refused_naming_the_field() -> None:
    payload = {
        **_VALID_PAYLOAD_DICT,
        "info": [{**_VALID_PAYLOAD_DICT["info"][0], "headline": "Flood\x1b warning"}],
    }
    with pytest.raises(
        ValueError, match="headline contains a character that CAP XML cannot carry"
    ):
        CapAlertCreate.model_validate(payload)


def test_vertical_tab_and_form_feed_become_newlines_and_are_accepted() -> None:
    payload = {
        **_VALID_PAYLOAD_DICT,
        "info": [
            {
                **_VALID_PAYLOAD_DICT["info"][0],
                "description": "Line one\x0bline two\x0cthree",
            }
        ],
    }
    created = CapAlertCreate.model_validate(payload)
    assert created.info[0].description == "Line one\nline two\nthree"


def test_a_control_character_in_a_cancel_or_publish_note_is_refused() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CapPublishAction(note="reason\x00")
    with pytest.raises(ValidationError):
        CapEmergencyPublish(reason="reason\x1f")


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_a_non_finite_altitude_or_ceiling_is_refused_on_save(value: float) -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="must be a finite number"):
        CapAreaCreate(area_desc="Here", altitude=value)
    with pytest.raises(ValidationError, match="must be a finite number"):
        CapAreaCreate(area_desc="Here", ceiling=value)


def test_a_non_finite_coordinate_is_refused_on_save() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="finite numbers"):
        CapAreaCreate(area_desc="Here", polygons=[[[float("nan"), 12.0]]])


def test_a_syntax_error_at_publish_is_a_422_not_a_crash() -> None:
    with pytest.raises(CapSchemaValidationError) as raised:
        ensure_cap_schema(b"<alert>\x1b</alert>", action="publish")
    assert raised.value.status_code == 422
    assert "not well-formed XML" in raised.value.message


def test_illegal_characters_are_stripped_before_a_publish_that_gets_past_save() -> None:
    assert strip_illegal_xml_chars("a\x1b￾b\nc") == "ab\nc"


# ── Item 2: emergency publish and cancellation go out past a schema mismatch ────


@pytest.fixture
def forced_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the schema check report a mismatch, to exercise the gate's branches."""

    def mismatch(_xml: str | bytes) -> list[str]:
        return ["line 2: element 'forced': this is a forced test mismatch"]

    monkeypatch.setattr(xsd, "cap_schema_errors", mismatch)


@pytest.fixture
def mismatch_notices(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, object]]:
    sent: list[dict[str, object]] = []

    async def record(**kwargs: object) -> int:
        sent.append(kwargs)
        return 1

    monkeypatch.setattr(cap_service, "notify_schema_mismatch", record)
    return sent


async def _approved_alert(db: AsyncSession, user: User) -> CapAlert:
    if await db.get(ApprovalPolicy, "cap") is None:
        db.add(ApprovalPolicy(key="cap", allow_self_approval=True))
        await db.commit()
    alert = await cap_service.create_alert(
        session=db, current_user=user, payload=CapAlertCreate(**_VALID_PAYLOAD_DICT)
    )
    await cap_service.submit_alert(
        session=db, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    await cap_service.approve_alert(
        session=db,
        current_user=await make_user(db, superuser=True),
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    return alert


@pytest.mark.usefixtures("forced_mismatch")
async def test_normal_publish_still_refuses_a_schema_mismatch(
    db_async: AsyncSession,
    mismatch_notices: list[dict[str, object]],
) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _approved_alert(db_async, user)

    with pytest.raises(CapSchemaValidationError):
        await cap_service.publish_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapPublishAction(),
        )
    assert mismatch_notices == []


@pytest.mark.usefixtures("forced_mismatch")
async def test_emergency_publish_goes_out_audited_and_tells_the_duty_supervisor(
    db_async: AsyncSession,
    mismatch_notices: list[dict[str, object]],
    caplog: pytest.LogCaptureFixture,
) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _approved_alert(db_async, user)

    with caplog.at_level(logging.ERROR, logger="src.cap.xsd"):
        published, _snapshot = await cap_service.emergency_publish_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapEmergencyPublish(reason="Flash flood now"),
        )

    assert published.lifecycle_state == CapLifecycleState.PUBLISHED
    assert [n["action"] for n in mismatch_notices] == ["published"]
    assert "forced test mismatch" in str(mismatch_notices[0]["problem"])
    assert any(r.levelno == logging.ERROR for r in caplog.records)
    from src.cap.models import CapAuditEvent

    events = (
        (
            await db_async.execute(
                select(CapAuditEvent).where(CapAuditEvent.alert_id == alert.id)
            )
        )
        .scalars()
        .all()
    )
    emergency = [e for e in events if e.action == "emergency_publish"]
    assert emergency and "schema_mismatch" in (emergency[0].payload or {})


async def test_cancel_goes_out_past_a_mismatch_and_is_audited(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    mismatch_notices: list[dict[str, object]],
) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _approved_alert(db_async, user)
    await cap_service.publish_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapPublishAction(),
    )
    monkeypatch.setattr(
        xsd,
        "cap_schema_errors",
        lambda xml: ["line 2: element 'forced': this is a forced test mismatch"],
    )

    cancelled = await cap_service.cancel_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapAlertAction(note="Event has passed"),
    )

    assert cancelled.lifecycle_state == CapLifecycleState.CANCELLED
    assert [n["action"] for n in mismatch_notices] == ["cancelled"]


async def test_a_mismatch_notice_goes_to_the_duty_roles_with_the_problem(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.notifications import gms

    user = await make_user(db_async, superuser=True)
    alert = await cap_service.create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(**_VALID_PAYLOAD_DICT),
    )
    told: list[dict[str, object]] = []

    async def holders(_session: object, keys: object, **_: object) -> set:
        assert set(keys) == set(gms.CAP_DUTY_PERMISSIONS)
        return {user.id}

    async def tell(
        _session: object,
        event_key: str,
        recipients: object,
        context: dict,
        **kwargs: object,
    ) -> int:
        told.append(
            {
                "event_key": event_key,
                "recipients": recipients,
                "context": context,
                **kwargs,
            }
        )
        return 1

    from src.cap import notifications as cap_notifications

    monkeypatch.setattr(gms, "duty_or_holders", holders)
    monkeypatch.setattr(gms, "tell", tell)
    await cap_notifications.notify_schema_mismatch(
        session=db_async, alert=alert, problem="line 2: forced", action="published"
    )

    assert told[0]["event_key"] == gms.CAP_FORMAT_PROBLEM
    assert told[0]["context"]["problem"] == "line 2: forced"
    assert told[0]["recipients"] == {user.id}


# ── Item 3: an import altered to be stored is flagged with each change ─────────


async def test_an_import_that_needed_changes_is_flagged_even_when_its_schema_is_valid(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    conforming_but_out_of_order = _ENTRY_XML.replace(
        b"<description>",
        b"<expires>2026-06-28T09:00:00+00:00</expires><onset>2026-06-28T10:00:00+00:00</onset><description>",
    )
    imported = await cap_service.import_alert(
        session=db_async,
        current_user=user,
        source="xml",
        value=conforming_but_out_of_order.decode(),
    )
    assert imported.schema_conformant is False
    assert "expires is not after onset" in (imported.schema_error or "")
    assert imported.info[0].expires is None


# ── Item 4: response types are normalised or dropped, never refused ────────────


async def test_unknown_and_oddly_cased_response_types_are_stored_flagged_not_refused(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    doc = _ENTRY_XML.replace(
        b"<description>",
        b"<responseType> prepare </responseType><responseType>ALLCLEAR</responseType>"
        b"<responseType>Hide</responseType><description>",
    )
    imported = await cap_service.import_alert(
        session=db_async, current_user=user, source="xml", value=doc.decode()
    )

    assert imported.info[0].response_types == ["Prepare", "AllClear"]
    assert imported.schema_conformant is False
    assert "'Hide' is not a CAP response type" in (imported.schema_error or "")


# ── Hardening: a failing duty notice never blocks the send ──────────────────────


@pytest.mark.usefixtures("forced_mismatch")
async def test_a_failing_mismatch_notice_still_publishes_and_audits(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def broken(**_kwargs: object) -> int:
        raise RuntimeError("notification backend down")

    monkeypatch.setattr(cap_service, "notify_schema_mismatch", broken)
    user = await make_user(db_async, superuser=True)
    alert = await _approved_alert(db_async, user)

    with caplog.at_level(logging.ERROR, logger="src.cap.service"):
        published, _snapshot = await cap_service.emergency_publish_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapEmergencyPublish(reason="Flash flood now"),
        )

    assert published.lifecycle_state == CapLifecycleState.PUBLISHED
    assert any("notification failed" in r.getMessage() for r in caplog.records)
    from src.cap.models import CapAuditEvent

    events = (
        (
            await db_async.execute(
                select(CapAuditEvent).where(CapAuditEvent.alert_id == alert.id)
            )
        )
        .scalars()
        .all()
    )
    assert any(
        e.action == "emergency_publish" and "schema_mismatch" in (e.payload or {})
        for e in events
    )


async def test_a_failing_mismatch_notice_still_cancels_and_audits(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _approved_alert(db_async, user)
    await cap_service.publish_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapPublishAction(),
    )

    async def broken(**_kwargs: object) -> int:
        raise RuntimeError("notification backend down")

    monkeypatch.setattr(cap_service, "notify_schema_mismatch", broken)
    monkeypatch.setattr(
        xsd,
        "cap_schema_errors",
        lambda xml: ["line 2: element 'forced': this is a forced test mismatch"],
    )

    cancelled = await cap_service.cancel_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapAlertAction(note="Event has passed"),
    )

    assert cancelled.lifecycle_state == CapLifecycleState.CANCELLED


# ── Hardening: stripped XML that is still not well-formed goes out when allowed ──


async def test_an_emergency_gate_sends_still_malformed_xml_with_the_problem() -> None:
    xml, problem = await xsd.gate_cap_xml(
        "<alert><unclosed></alert>",
        action="emergency_publish",
        identifier="ID-1",
        alert_id=uuid.uuid4(),
        allow_mismatch=True,
    )
    assert xml == "<alert><unclosed></alert>"
    assert problem is not None and "not well-formed XML" in problem


async def test_a_normal_gate_still_refuses_still_malformed_xml() -> None:
    with pytest.raises(CapSchemaValidationError):
        await xsd.gate_cap_xml(
            "<alert><unclosed></alert>",
            action="publish",
            identifier="ID-1",
            alert_id=uuid.uuid4(),
            allow_mismatch=False,
        )
