"""Every real CAP shape the system produces must validate against the OASIS CAP 1.2 schema.

``src/cap/standards/CAP-v1.2.xsd`` is the unmodified OASIS file (see its README).
The shapes below come from the same code paths the publisher uses: the GMS level
rules in ``src/cap/levels.py``, every hazard event in the desk's list (the snapshot
in ``fixtures/gms_catalogue.json``), Exercise and Actual, Alert, Update and Cancel,
each scope, the geometry kinds, several info blocks, resources, the GMS
parameters and a signed message. The refusal cases are in
``test_cap_xsd_refusal.py``.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest
from lxml import etree

from src.cap import levels, sign
from src.cap.config import cap_config
from src.cap.levels import GmsColour, GmsProduct
from src.cap.models import (
    CapAreaKind,
    CapCategory,
    CapCertainty,
    CapLifecycleState,
    CapMessageType,
    CapResponseType,
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
    CapReferencePublic,
    CapResourcePublic,
)
from src.cap.xml import alert_to_cap_xml, xml_to_alert_data

from .test_feeds import _ENTRY_XML
from .test_import import _XML as IMPORT_XML
from .test_sign import _self_signed
from .test_xml_parser import _SAMPLE as PARSER_SAMPLE

SCHEMA_PATH = (
    Path(__file__).resolve().parents[2] / "src" / "cap" / "standards" / "CAP-v1.2.xsd"
)
CATALOGUE = json.loads(
    (Path(__file__).parent / "fixtures" / "gms_catalogue.json").read_text(
        encoding="utf-8"
    )
)
HAZARD_EVENTS = [
    event for group in CATALOGUE["hazard_groups"] for event in group["events"]
]
COLOURS = [GmsColour.GREEN, GmsColour.YELLOW, GmsColour.ORANGE, GmsColour.RED]
PRODUCT_LEVELS = [(GmsProduct.OUTLOOK, None)] + [
    (product, colour)
    for product in (GmsProduct.WATCH, GmsProduct.WARNING, GmsProduct.ADVISORY)
    for colour in COLOURS
]
NOW = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
RING = [[-61.8, 12.0], [-61.7, 12.2], [-61.6, 12.1], [-61.8, 12.0]]
RING_B = [[-61.66, 12.05], [-61.62, 12.1], [-61.6, 12.05], [-61.66, 12.05]]


@pytest.fixture(scope="module")
def schema() -> etree.XMLSchema:
    return etree.XMLSchema(etree.parse(str(SCHEMA_PATH)))


def assert_valid(schema: etree.XMLSchema, xml: str) -> None:
    document = etree.fromstring(xml.encode("utf-8"))
    if not schema.validate(document):
        pytest.fail("\n".join(str(error) for error in schema.error_log))


# --------------------------------------------------------------------------- #
# Builders. They construct the same public models the publisher builds.
# --------------------------------------------------------------------------- #


def area(**overrides: object) -> CapAreaPublic:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "sequence": 0,
        "kind": CapAreaKind.POLYGON,
        "area_desc": "Saint George",
        "polygons": [RING],
    }
    values.update(overrides)
    return CapAreaPublic.model_validate(values)


def info(
    *,
    event: str = "Heavy Rainfall Warning",
    product: GmsProduct = GmsProduct.WARNING,
    colour: GmsColour | None = GmsColour.ORANGE,
    sequence: int = 0,
    areas: list[CapAreaPublic] | None = None,
    parameters: list[CapNameValue] | None = None,
    resources: list[CapResourcePublic] | None = None,
    categories: list[CapCategory] | None = None,
    **overrides: object,
) -> CapInfoPublic:
    if product is GmsProduct.OUTLOOK:
        colour = None
    urgency, certainty = (
        levels.outlook_defaults()
        if product is GmsProduct.OUTLOOK
        else (CapUrgency.IMMEDIATE, CapCertainty.LIKELY)
    )
    severity = levels.severity_for(colour) if colour else CapSeverity.UNKNOWN
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "sequence": sequence,
        "language": "en",
        "categories": categories or [CapCategory.MET],
        "event": event,
        "urgency": urgency,
        "severity": severity,
        "certainty": certainty,
        "effective": NOW,
        "onset": NOW + timedelta(minutes=30),
        "expires": NOW + timedelta(hours=6),
        "headline": f"{event} for Grenada",
        "description": "Heavy rain is expected across Grenada.",
        "parameters": [
            *levels.level_parameters(product, colour),
            *(parameters or []),
        ],
        "resources": resources or [],
        "areas": areas if areas is not None else [area()],
    }
    values.update(overrides)
    return CapInfoPublic.model_validate(values)


def alert(
    *,
    infos: list[CapInfoPublic] | None = None,
    msg_type: CapMessageType = CapMessageType.ALERT,
    status: CapStatus = CapStatus.ACTUAL,
    scope: CapScope = CapScope.PUBLIC,
    references: list[CapReferencePublic] | None = None,
    **overrides: object,
) -> CapAlertPublic:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "identifier": f"gms-{uuid.uuid4().hex[:12]}",
        "sender": "duty@gms.example.test",
        "sent": NOW,
        "status": status,
        "msg_type": msg_type,
        "scope": scope,
        "lifecycle_state": CapLifecycleState.APPROVED,
        "created_by_user_id": uuid.uuid4(),
        "created_at": NOW,
        "updated_at": NOW,
        "info": infos if infos is not None else [info()],
        "references": references or [],
    }
    values.update(overrides)
    return CapAlertPublic.model_validate(values)


def reference_to(previous: CapAlertPublic) -> CapReferencePublic:
    return CapReferencePublic(
        id=uuid.uuid4(),
        sequence=0,
        sender=previous.sender,
        identifier=previous.identifier,
        sent=previous.sent,
    )


# --------------------------------------------------------------------------- #
# Shapes
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(("product", "colour"), PRODUCT_LEVELS)
def test_each_gms_product_and_colour_validates(
    schema: etree.XMLSchema, product: GmsProduct, colour: GmsColour | None
) -> None:
    assert_valid(
        schema, alert_to_cap_xml(alert(infos=[info(product=product, colour=colour)]))
    )


@pytest.mark.parametrize("event", HAZARD_EVENTS)
def test_each_hazard_event_in_the_desk_list_validates(
    schema: etree.XMLSchema, event: str
) -> None:
    assert_valid(schema, alert_to_cap_xml(alert(infos=[info(event=event)])))


@pytest.mark.parametrize("status", [CapStatus.ACTUAL, CapStatus.EXERCISE])
@pytest.mark.parametrize(
    "msg_type", [CapMessageType.ALERT, CapMessageType.UPDATE, CapMessageType.CANCEL]
)
def test_status_and_message_type_combinations_validate(
    schema: etree.XMLSchema, status: CapStatus, msg_type: CapMessageType
) -> None:
    previous = alert()
    references = (
        [reference_to(previous)] if msg_type is not CapMessageType.ALERT else []
    )
    infos = [] if msg_type is CapMessageType.CANCEL else [info()]
    current = alert(
        infos=infos,
        msg_type=msg_type,
        status=status,
        references=references,
        note="Cancelled after the event passed."
        if msg_type is CapMessageType.CANCEL
        else None,
    )
    assert_valid(schema, alert_to_cap_xml(current))


def test_restricted_scope_with_restriction_validates(schema: etree.XMLSchema) -> None:
    assert_valid(
        schema,
        alert_to_cap_xml(
            alert(
                scope=CapScope.RESTRICTED, restriction="Emergency management staff only"
            )
        ),
    )


def test_private_scope_with_addresses_validates(schema: etree.XMLSchema) -> None:
    assert_valid(
        schema,
        alert_to_cap_xml(
            alert(scope=CapScope.PRIVATE, addresses=["duty@gms.example.test"])
        ),
    )


@pytest.mark.parametrize(
    "geometry",
    [
        {"polygons": [RING]},
        {"multipolygons": [[RING, RING_B]], "polygons": []},
        {"circles": [{"lat": 12.05, "lon": -61.75, "radius": 5.0}], "polygons": []},
        {
            "geocodes": [CapNameValue(value_name="ISO3166-2:GD", value="GD-03")],
            "polygons": [],
        },
        {"geocodes": [CapNameValue(value_name="ISO3166-2:GD", value="GD-10")]},
        {"altitude": 1500.5, "ceiling": 3000.0},
        {"polygons": [], "area_desc": "Grenada-wide, no drawn geometry"},
        {
            "circles": [{"lat": 12.05, "lon": -61.75, "radius": 2.0}],
            "geocodes": [CapNameValue(value_name="ISO3166-2:GD", value="GD-01")],
        },
    ],
    ids=[
        "polygon",
        "multipolygon",
        "circle",
        "geocode",
        "geocode-carriacou",
        "altitude-and-ceiling",
        "area-without-geometry",
        "circle-and-geocode",
    ],
)
def test_geometry_shapes_validate(
    schema: etree.XMLSchema, geometry: dict[str, object]
) -> None:
    assert_valid(
        schema, alert_to_cap_xml(alert(infos=[info(areas=[area(**geometry)])]))
    )


def test_multiple_info_blocks_with_their_own_areas_validate(
    schema: etree.XMLSchema,
) -> None:
    rain = info(
        event="Heavy Rainfall Watch",
        product=GmsProduct.WATCH,
        colour=GmsColour.YELLOW,
        sequence=0,
        areas=[
            area(area_desc="Saint Andrew", sequence=0),
            area(area_desc="Saint David", sequence=1, polygons=[RING_B]),
        ],
    )
    flood = info(
        event="Flash Flood Warning",
        product=GmsProduct.WARNING,
        colour=GmsColour.RED,
        sequence=1,
        categories=[CapCategory.MET, CapCategory.ENV],
        areas=[
            area(
                area_desc="Saint Patrick",
                sequence=0,
                circles=[{"lat": 12.2, "lon": -61.7, "radius": 4.5}],
                polygons=[],
            )
        ],
    )
    outlook = info(
        event="Tropical Depression", product=GmsProduct.OUTLOOK, sequence=2, areas=[]
    )
    assert_valid(schema, alert_to_cap_xml(alert(infos=[rain, flood, outlook])))


def test_resources_validate(schema: etree.XMLSchema) -> None:
    resources = [
        CapResourcePublic(
            id=uuid.uuid4(),
            sequence=0,
            resource_desc="Warning bulletin (PDF)",
            mime_type="application/pdf",
            size=48213,
            uri="https://api.example.test/api/cap/alerts/gms-1/attachments/pdf",
            deref_uri=None,
            digest="3f786850e387550fdab836ed7e6dc881de23001b",
        ),
        CapResourcePublic(
            id=uuid.uuid4(),
            sequence=1,
            resource_desc="Map of the warning area (PNG)",
            mime_type="image/png",
            size=None,
            uri="/api/cap/alerts/gms-1/attachments/map",
            deref_uri=None,
            digest=None,
        ),
        CapResourcePublic(
            id=uuid.uuid4(),
            sequence=2,
            resource_desc="Attachment with the required fields only",
            mime_type="text/plain",
            size=None,
            uri=None,
            deref_uri=None,
            digest=None,
        ),
    ]
    assert_valid(schema, alert_to_cap_xml(alert(infos=[info(resources=resources)])))


def test_gms_parameters_validate(schema: etree.XMLSchema) -> None:
    parameters = [
        CapNameValue(value_name="GMS:sectors", value="tourism,marine,roads-transport"),
        CapNameValue(value_name="GMS:source-bulletin-kind", value="marine-bulletin"),
        CapNameValue(
            value_name="GMS:source-bulletin-id",
            value="8f14e45f-ceea-467f-a0e6-7c2e2f2d9a10",
        ),
        CapNameValue(value_name="GMS:source-bulletin-revision", value="3"),
        # Internal: kept on the alert, never written into the XML.
        CapNameValue(value_name="GMS:override-reason", value="Forecaster override"),
    ]
    assert_valid(schema, alert_to_cap_xml(alert(infos=[info(parameters=parameters)])))


def test_optional_info_fields_validate(schema: etree.XMLSchema) -> None:
    full = info(
        event_codes=[CapNameValue(value_name="SAME", value="RWW")],
        response_types=[item.value for item in CapResponseType],
        audience="General public",
        sender_name="Grenada Meteorological Service",
        instruction="Move to higher ground and avoid low-lying roads.",
        web="https://www.example.test/warnings",
        contact="duty@gms.example.test",
    )
    assert_valid(schema, alert_to_cap_xml(alert(infos=[full])))


@pytest.mark.parametrize(
    "times",
    [
        {
            "sent": datetime(
                2026, 10, 23, 16, 17, 7, 514612, tzinfo=timezone(timedelta(hours=-4))
            )
        },
        {"effective": None, "onset": None, "expires": NOW + timedelta(hours=1)},
        {"effective": NOW, "onset": None, "expires": None},
    ],
    ids=["sent-with-offset-and-microseconds", "expires-only", "effective-only"],
)
def test_time_shapes_validate(
    schema: etree.XMLSchema, times: dict[str, object]
) -> None:
    if "sent" in times:
        current = alert(sent=times["sent"])
    else:
        current = alert(infos=[info(**times)])
    assert_valid(schema, alert_to_cap_xml(current))


def test_signed_message_validates(
    schema: etree.XMLSchema, monkeypatch: pytest.MonkeyPatch
) -> None:
    cert_pem, key_pem = _self_signed()
    monkeypatch.setattr(cap_config, "CAP_SIGNING_CERT", cert_pem)
    monkeypatch.setattr(cap_config, "CAP_SIGNING_KEY", key_pem)

    signed = sign.sign_xml(alert_to_cap_xml(alert(infos=[info()])))

    assert "Signature" in signed
    assert_valid(schema, signed)


@pytest.mark.parametrize(
    "xml",
    [PARSER_SAMPLE, IMPORT_XML, _ENTRY_XML.decode("utf-8")],
    ids=["parser-sample", "import-sample", "feed-entry"],
)
def test_existing_fixtures_validate(schema: etree.XMLSchema, xml: str) -> None:
    assert_valid(schema, xml)


def test_parsed_message_is_still_valid_after_a_round_trip(
    schema: etree.XMLSchema,
) -> None:
    sectors = CapNameValue(value_name="GMS:sectors", value="health")
    xml = alert_to_cap_xml(alert(infos=[info(parameters=[sectors])]))

    assert xml_to_alert_data(xml).identifier
    assert_valid(schema, xml)
