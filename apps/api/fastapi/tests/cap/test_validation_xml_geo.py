from datetime import UTC, datetime, timedelta
from uuid import uuid4

from src.cap.geo import alerts_to_feature_collection
from src.cap.models import (
    CapAreaKind,
    CapCategory,
    CapCertainty,
    CapLifecycleState,
    CapMessageType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)
from src.cap.schemas import (
    CapAlertPublic,
    CapAreaPublic,
    CapInfoPublic,
    CapNameValue,
)
from src.cap.validation import validate_cap_alert
from src.cap.xml import alert_to_cap_xml


def test_cap_xml_uses_oasis_order_and_snapshot_ready_content() -> None:
    alert = _alert()

    xml = alert_to_cap_xml(alert)

    assert "<identifier>test-alert</identifier>" in xml
    assert xml.index("<identifier>") < xml.index("<sender>")
    assert xml.index("<sender>") < xml.index("<sent>")
    assert xml.index("<msgType>Alert</msgType>") < xml.index("<scope>Public</scope>")
    assert "<headline>Heavy rainfall warning</headline>" in xml
    assert "<polygon>12,-61.8 12.2,-61.7 12.1,-61.6 12,-61.8</polygon>" in xml


def test_cap_xml_keeps_default_namespace_when_another_library_claims_it() -> None:
    # WeasyPrint registers its own "" namespace on import; CAP output must not
    # fall back to ns0: prefixes when that happens.
    from xml.etree import ElementTree as ET

    ET.register_namespace("", "http://example.com/other")

    xml = alert_to_cap_xml(_alert())

    assert '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">' in xml
    assert "ns0:" not in xml


def test_validation_rejects_non_alert_without_references() -> None:
    alert = _alert(msg_type=CapMessageType.CANCEL)

    result = validate_cap_alert(alert)

    assert not result.is_valid
    assert "references are required for Update, Cancel, Ack, and Error" in result.errors


def test_validation_rejects_a_colour_that_contradicts_severity() -> None:
    from src.cap.levels import GmsColour, GmsProduct, level_parameters

    alert = _alert()
    alert.info[0].parameters = level_parameters(GmsProduct.WARNING, GmsColour.RED)

    result = validate_cap_alert(alert)

    assert not result.is_valid
    assert any("Red requires severity Extreme" in error for error in result.errors)


def test_source_bulletin_link_requires_an_exact_revision() -> None:
    alert = _alert()
    source = [
        CapNameValue(value_name="GMS:source-bulletin-kind", value="marine"),
        CapNameValue(
            value_name="GMS:source-bulletin-id",
            value="11111111-1111-4111-8111-111111111111",
        ),
        CapNameValue(value_name="GMS:source-bulletin-revision", value="3"),
    ]
    alert.info[0].parameters = source
    assert validate_cap_alert(alert).is_valid
    alert.info[0].parameters = source[:2]
    assert any(
        "source bulletin requires kind, ID, and revision" in error
        for error in validate_cap_alert(alert).errors
    )
    alert.info[0].parameters = source[:2] + [
        CapNameValue(value_name="GMS:source-bulletin-revision", value="0")
    ]
    assert any(
        "revision must be a positive integer" in error
        for error in validate_cap_alert(alert).errors
    )


def test_geojson_contains_alert_area_features() -> None:
    alert = _alert()

    feature_collection = alerts_to_feature_collection([alert])

    assert feature_collection["type"] == "FeatureCollection"
    assert len(feature_collection["features"]) == 1
    assert feature_collection["features"][0]["geometry"]["type"] == "Polygon"
    assert feature_collection["features"][0]["properties"]["identifier"] == "test-alert"


def _alert(msg_type: CapMessageType = CapMessageType.ALERT) -> CapAlertPublic:
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
        expires=now + timedelta(hours=6),
        headline="Heavy rainfall warning",
        description="Heavy rainfall is expected across Grenada.",
        areas=[
            CapAreaPublic(
                id=uuid4(),
                sequence=0,
                kind=CapAreaKind.POLYGON,
                area_desc="Grenada",
                polygons=[
                    [
                        [-61.8, 12.0],
                        [-61.7, 12.2],
                        [-61.6, 12.1],
                        [-61.8, 12.0],
                    ]
                ],
            )
        ],
    )
    return CapAlertPublic(
        id=uuid4(),
        identifier="test-alert",
        sender="cap@weather.gd",
        sent=now,
        status=CapStatus.ACTUAL,
        msg_type=msg_type,
        scope=CapScope.PUBLIC,
        lifecycle_state=CapLifecycleState.APPROVED,
        created_by_user_id=uuid4(),
        created_at=now,
        updated_at=now,
        info=[info],
        xml_url="/api/cap/test-alert.xml",
    )
