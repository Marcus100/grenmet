"""An imported CAP document is stored even when it breaks the schema.

``coerce_for_import`` gives each value our model cannot hold a neutral replacement.
A conforming document keeps its meaning, and the first schema error (taken from the
document as received) is what flags the alert.
"""

import pytest

from src.cap.exceptions import CapImportError
from src.cap.import_coerce import PLACEHOLDER, coerce_for_import
from src.cap.xml import ensure_well_formed, xml_to_alert_data
from src.cap.xsd import first_schema_error

from .test_feeds import _ENTRY_XML

NS = 'xmlns="urn:oasis:names:tc:emergency:cap:1.2"'


def _doc(body: str) -> bytes:
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>\n<alert {NS}>'
        "<identifier>IMP-1</identifier><sender>met@gov.gd</sender>"
        "<sent>2026-06-28T12:00:00+00:00</sent><status>Actual</status>"
        "<msgType>Alert</msgType><scope>Public</scope>"
        "<info><category>Met</category><event>Flash Flood</event>"
        "<urgency>Immediate</urgency><severity>Severe</severity>"
        "<certainty>Likely</certainty><headline>Flash Flood Warning</headline>"
        f"<description>Heavy rain.</description>{body}</info></alert>"
    ).encode()


def _parsed(raw: bytes):  # the importer's own parse of the coerced document
    document, _changes = coerce_for_import(raw)
    return xml_to_alert_data(document)


def test_a_conforming_document_keeps_its_meaning_and_needs_no_change() -> None:
    raw = _ENTRY_XML
    assert first_schema_error(raw) is None
    document, changes = coerce_for_import(raw)
    assert changes == []
    assert (
        xml_to_alert_data(document).model_dump() == xml_to_alert_data(raw).model_dump()
    )


def test_unknown_enumeration_values_become_neutral_values_and_are_flagged() -> None:
    raw = _doc("").replace(
        b"<severity>Severe</severity>", b"<severity>Critical</severity>"
    )
    raw = raw.replace(b"<urgency>Immediate</urgency>", b"<urgency>Now</urgency>")
    raw = raw.replace(b"<certainty>Likely</certainty>", b"<certainty>Sure</certainty>")
    raw = raw.replace(b"<category>Met</category>", b"<category>Weather</category>")
    raw = raw.replace(b"<status>Actual</status>", b"<status>Real</status>")
    raw = raw.replace(b"<msgType>Alert</msgType>", b"<msgType>Notice</msgType>")
    raw = raw.replace(b"<scope>Public</scope>", b"<scope>Global</scope>")

    assert first_schema_error(raw) is not None
    payload = _parsed(raw)
    info = payload.info[0]
    assert info.severity.value == "Unknown"
    assert info.urgency.value == "Unknown"
    assert info.certainty.value == "Unknown"
    assert [c.value for c in info.categories] == ["Other"]
    assert payload.status.value == "Draft"
    assert payload.msg_type.value == "Alert"
    assert payload.scope.value == "Public"


def test_a_utc_designator_and_a_naive_time_are_stored_as_utc() -> None:
    raw = _doc("").replace(b"2026-06-28T12:00:00+00:00", b"2026-06-28T12:00:00Z")
    assert first_schema_error(raw) is not None
    assert _parsed(raw).sent.isoformat().endswith("+00:00")

    naive = _doc("<onset>2026-06-28T13:00:00</onset>")
    assert _parsed(naive).info[0].onset is not None


def test_a_time_that_is_out_of_order_is_dropped_not_refused() -> None:
    raw = _doc(
        "<effective>2026-06-28T12:00:00+00:00</effective>"
        "<onset>2026-06-28T10:00:00+00:00</onset>"
        "<expires>2026-06-28T09:00:00+00:00</expires>"
    )
    info = _parsed(raw).info[0]
    assert info.onset is None
    assert info.expires is None


def test_an_update_without_references_is_stored_as_an_alert() -> None:
    raw = _doc("").replace(b"<msgType>Alert</msgType>", b"<msgType>Update</msgType>")
    assert _parsed(raw).msg_type.value == "Alert"


def test_restricted_and_private_scopes_get_their_missing_field() -> None:
    restricted = _doc("").replace(
        b"<scope>Public</scope>", b"<scope>Restricted</scope>"
    )
    assert _parsed(restricted).restriction == PLACEHOLDER
    private = _doc("").replace(b"<scope>Public</scope>", b"<scope>Private</scope>")
    assert _parsed(private).addresses == ["not-stated"]


def test_missing_required_text_gets_the_placeholder() -> None:
    raw = (
        f'<?xml version="1.0"?><alert {NS}><sender>a@b.test</sender><sent>2026-06-28T12:00:00+00:00</sent>'
        "<status>Actual</status><msgType>Alert</msgType><scope>Public</scope>"
        "<info><category>Met</category><urgency>Immediate</urgency>"
        "<severity>Severe</severity><certainty>Likely</certainty>"
        "<area><polygon>12.0,-61.7 12.1,-61.6 12.2,-61.8</polygon></area></info></alert>"
    ).encode()
    info = _parsed(raw).info[0]
    assert info.event == PLACEHOLDER
    assert info.headline == PLACEHOLDER
    assert info.description == PLACEHOLDER


def test_a_bad_language_and_a_web_address_with_a_space_are_neutralised() -> None:
    raw = _doc("<web>https://example.test/a page</web>").replace(
        b"<info>", b"<info><language>en_GB</language>"
    )
    info = _parsed(raw).info[0]
    assert info.language == "en"
    assert info.web is None


def test_a_bad_polygon_and_a_bad_altitude_are_dropped() -> None:
    raw = _doc(
        "<area><areaDesc>Here</areaDesc><polygon>12,x 12.1,-61.6</polygon>"
        "<altitude>high</altitude></area>"
        "<area><areaDesc>Ok</areaDesc><polygon>12.0,-61.7 12.1,-61.6 12.2,-61.8</polygon></area>"
    )
    areas = _parsed(raw).info[0].areas
    assert areas[0].polygons == []
    assert areas[0].altitude is None
    assert len(areas[1].polygons[0]) == 3


def test_a_document_with_a_dtd_is_still_refused() -> None:
    raw = b'<?xml version="1.0"?><!DOCTYPE alert [<!ENTITY x "y">]><alert/>'
    with pytest.raises(CapImportError):
        ensure_well_formed(raw)


def test_malformed_xml_is_still_refused() -> None:
    with pytest.raises(CapImportError):
        ensure_well_formed(b"<alert><identifier>")
