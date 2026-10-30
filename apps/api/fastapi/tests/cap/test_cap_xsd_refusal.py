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
from src.cap import service as cap_service
from src.cap import xsd
from src.cap.exceptions import CapSchemaValidationError
from src.cap.models import CapAlert, CapFeedImport, CapLifecycleState, CapScope
from src.cap.schemas import CapAlertAction, CapAlertCreate
from src.cap.xml import alert_to_cap_xml
from src.cap.xsd import cap_schema_errors, ensure_cap_schema
from tests.factories import make_user

from .test_cap_state_machine import _VALID_PAYLOAD_DICT, _publish_approved
from .test_cap_xsd_corpus import alert, info
from .test_feeds import _ENTRY_XML, _patch_feedparser

CAP = "{urn:oasis:names:tc:emergency:cap:1.2}"
REFUSAL_LOG = "CAP XML refused by the CAP 1.2 schema"

Mutation = Callable[[etree._Element], None]


@pytest.fixture(autouse=True)
def _enabled_refusal_logger(monkeypatch: pytest.MonkeyPatch) -> None:
    # Alembic's fileConfig (run by the database bootstrap) disables loggers that
    # already exist, so re-enable ours to keep the log assertions order-independent.
    monkeypatch.setattr(xsd.logger, "disabled", False)


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


async def test_publish_refuses_non_conforming_xml_and_publishes_nothing(
    db_async: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    user = await make_user(db_async, superuser=True)
    payload = {
        **_VALID_PAYLOAD_DICT,
        "info": [{**_VALID_PAYLOAD_DICT["info"][0], "response_types": ["Hide"]}],
    }
    created = await cap_service.create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(**payload),
    )

    with caplog.at_level(logging.WARNING, logger="src.cap.xsd"):
        with pytest.raises(CapSchemaValidationError) as raised:
            await _publish_approved(
                session=db_async,
                current_user=user,
                alert_id=created.id,
                payload=CapAlertAction(),
            )

    assert raised.value.status_code == 422
    stored = await db_async.get(CapAlert, created.id)
    assert stored is not None
    assert stored.lifecycle_state == CapLifecycleState.APPROVED
    assert any(getattr(r, "action", None) == "publish" for r in caplog.records)


async def test_import_api_refuses_non_conforming_xml_with_422(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    resp = await async_client.post(
        "/api/v1/cap/alerts/import",
        headers=superuser_token_headers_async,
        json={"source": "xml", "value": _BAD_XML.decode("utf-8")},
    )

    assert resp.status_code == 422, resp.text
    assert "official CAP 1.2 schema" in resp.json()["detail"]
    stored = await db_async.execute(
        select(CapAlert).where(CapAlert.identifier == "FEED-001")
    )
    assert stored.scalars().first() is None


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


async def test_feed_skips_a_non_conforming_entry_and_keeps_going(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    su: User = await make_user(db_async, superuser=True)
    row = CapFeedImport(name="GD peer", url="https://feeds.test/cap.rss")
    db_async.add(row)
    await db_async.commit()
    await db_async.refresh(row)

    links = ["https://feeds.test/bad.xml", "https://feeds.test/good.xml"]
    _patch_feedparser(monkeypatch, links)
    bodies = {
        links[0]: _BAD_XML,
        links[1]: _ENTRY_XML.replace(b"FEED-001", b"FEED-GOOD"),
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=bodies[str(request.url)])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await cap_service.ingest_feed(
            session=db_async, feed=row, system_user=su, http_client=client
        )

    assert result == {"created": 1, "skipped": 1}
    kept = await db_async.execute(
        select(CapAlert).where(CapAlert.identifier == "FEED-GOOD")
    )
    assert kept.scalars().first() is not None
    refused = await db_async.execute(
        select(CapAlert).where(CapAlert.identifier == "FEED-001")
    )
    assert refused.scalars().first() is None
