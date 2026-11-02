"""Published CAP XML must validate against the official OASIS CAP 1.2 schema.

``src/cap/standards/CAP-v1.2.xsd`` is the unmodified OASIS file (docs.oasis-open.org,
emergency/cap/v1.2; see its README). The test catches format drift the other XML tests cannot,
such as the ``Z`` designator and fractional seconds the standard forbids.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest
from lxml import etree

from src.cap.models import CapMessageType
from src.cap.schemas import CapReferencePublic
from src.cap.xml import _format_cap_datetime, alert_to_cap_xml

from .test_validation_xml_geo import _alert

SCHEMA_PATH = (
    Path(__file__).resolve().parents[2] / "src" / "cap" / "standards" / "CAP-v1.2.xsd"
)
CAP_DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2}$")


@pytest.fixture(scope="module")
def schema() -> etree.XMLSchema:
    return etree.XMLSchema(etree.parse(str(SCHEMA_PATH)))


def _validate(schema: etree.XMLSchema, xml: str) -> None:
    document = etree.fromstring(xml.encode("utf-8"))
    schema.assertValid(document)


def _reference_to(alert):
    return CapReferencePublic(
        id=uuid.uuid4(),
        sequence=0,
        sender=alert.sender,
        identifier=alert.identifier,
        sent=alert.sent,
    )


@pytest.mark.parametrize(
    "msg_type",
    [CapMessageType.ALERT, CapMessageType.UPDATE, CapMessageType.CANCEL],
)
def test_generated_alerts_validate_against_the_cap_schema(
    schema: etree.XMLSchema, msg_type: CapMessageType
) -> None:
    alert = _alert(msg_type)
    if msg_type != CapMessageType.ALERT:
        alert = alert.model_copy(update={"references": [_reference_to(alert)]})

    _validate(schema, alert_to_cap_xml(alert))


def test_times_have_whole_seconds_and_a_numeric_offset(
    schema: etree.XMLSchema,
) -> None:
    alert = _alert()
    # Microseconds and an aware non-UTC value both appear in real data.
    sent = datetime(
        2026, 10, 23, 16, 17, 7, 514612, tzinfo=timezone(timedelta(hours=-4))
    )
    alert = alert.model_copy(update={"sent": sent})

    xml = alert_to_cap_xml(alert)
    document = etree.fromstring(xml.encode("utf-8"))
    ns = {"cap": "urn:oasis:names:tc:emergency:cap:1.2"}
    times = [
        element.text
        for tag in ("sent", "effective", "onset", "expires")
        for element in document.iterfind(f".//cap:{tag}", ns)
    ]

    assert times
    assert all(value and CAP_DATETIME.match(value) for value in times)
    assert not any("Z" in (value or "") or "." in (value or "") for value in times)
    assert document.find("cap:sent", ns).text == "2026-10-23T20:17:07-00:00"
    schema.assertValid(document)


def test_format_treats_naive_values_as_utc() -> None:
    assert (
        _format_cap_datetime(datetime(2026, 10, 24, 1, 2, 3, 999999))
        == "2026-10-24T01:02:03-00:00"
    )
    assert (
        _format_cap_datetime(datetime(2026, 10, 24, 1, 2, 3, tzinfo=UTC))
        == "2026-10-24T01:02:03-00:00"
    )


def test_references_use_the_same_time_format(schema: etree.XMLSchema) -> None:
    alert = _alert(CapMessageType.UPDATE)
    alert = alert.model_copy(update={"references": [_reference_to(alert)]})

    xml = alert_to_cap_xml(alert)

    document = etree.fromstring(xml.encode("utf-8"))
    ns = {"cap": "urn:oasis:names:tc:emergency:cap:1.2"}
    reference = document.find("cap:references", ns).text
    assert reference
    sent_text = reference.split(",")[-1]
    assert CAP_DATETIME.match(sent_text)
    schema.assertValid(document)
