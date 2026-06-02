from datetime import datetime, timedelta, timezone
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


def test_validation_rejects_non_alert_without_references() -> None:
    alert = _alert(msg_type=CapMessageType.CANCEL)

    result = validate_cap_alert(alert)

    assert not result.is_valid
    assert "references are required for Update, Cancel, Ack, and Error" in result.errors


def test_geojson_contains_alert_area_features() -> None:
    alert = _alert()

    feature_collection = alerts_to_feature_collection([alert])

    assert feature_collection["type"] == "FeatureCollection"
    assert len(feature_collection["features"]) == 1
    assert feature_collection["features"][0]["geometry"]["type"] == "Polygon"
    assert feature_collection["features"][0]["properties"]["identifier"] == "test-alert"


def _alert(msg_type: CapMessageType = CapMessageType.ALERT) -> CapAlertPublic:
    now = datetime.now(timezone.utc)
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

