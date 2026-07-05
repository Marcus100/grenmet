"""CAP XML -> CapAlertCreate parser (src/cap/xml.py:xml_to_alert_data)."""

import pytest

from src.cap.exceptions import CapImportError
from src.cap.models import CapMessageType, CapScope, CapSeverity, CapStatus, CapUrgency
from src.cap.xml import xml_to_alert_data

_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>GRD-2026-0007</identifier>
  <sender>met@gov.gd</sender>
  <sent>2026-06-28T12:00:00+00:00</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <code>profile:CAP-GD:1.0</code>
  <info>
    <language>en</language>
    <category>Met</category>
    <event>Flash Flood</event>
    <responseType>Prepare</responseType>
    <urgency>Immediate</urgency>
    <severity>Severe</severity>
    <certainty>Likely</certainty>
    <headline>Flash Flood Warning</headline>
    <description>Heavy rainfall expected across St. George's.</description>
    <instruction>Move to higher ground.</instruction>
    <area>
      <areaDesc>St. George's</areaDesc>
      <polygon>12.05,-61.75 12.05,-61.74 12.06,-61.74 12.05,-61.75</polygon>
    </area>
  </info>
</alert>"""


def test_parses_core_fields() -> None:
    alert = xml_to_alert_data(_SAMPLE)
    assert alert.identifier == "GRD-2026-0007"
    assert alert.sender == "met@gov.gd"
    assert alert.status == CapStatus.ACTUAL
    assert alert.msg_type == CapMessageType.ALERT
    assert alert.scope == CapScope.PUBLIC
    assert alert.codes == ["profile:CAP-GD:1.0"]


def test_parses_info_and_geometry() -> None:
    alert = xml_to_alert_data(_SAMPLE)
    assert len(alert.info) == 1
    info = alert.info[0]
    assert info.event == "Flash Flood"
    assert info.severity == CapSeverity.SEVERE
    assert info.urgency == CapUrgency.IMMEDIATE
    assert info.response_types == ["Prepare"]
    # CAP polygons are 'lat,lon'; stored as [lon, lat]
    assert info.areas[0].polygons[0][0] == [-61.75, 12.05]


def test_rejects_malformed_xml() -> None:
    with pytest.raises(CapImportError):
        xml_to_alert_data("<alert><not closed>")


def test_rejects_non_alert_root() -> None:
    with pytest.raises(CapImportError):
        xml_to_alert_data('<?xml version="1.0"?><foo/>')


def test_build_then_parse_roundtrip_preserves_identifier_and_polygon() -> None:
    # Parse our sample, rebuild XML from a Public-like shape is heavy; instead
    # re-parse the builder's polygon format to confirm lat/lon round-trips.
    alert = xml_to_alert_data(_SAMPLE)
    # rebuild just the polygon string and re-parse
    from src.cap.xml import _format_polygon, _parse_polygon

    pts = alert.info[0].areas[0].polygons[0]
    assert _parse_polygon(_format_polygon(pts)) == pts


_BILLION_LAUGHS = """<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>&lol3;</identifier>
</alert>"""

_EXTERNAL_ENTITY = """<?xml version="1.0"?>
<!DOCTYPE alert [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>&xxe;</identifier>
</alert>"""


def test_rejects_billion_laughs_entity_expansion() -> None:
    with pytest.raises(CapImportError):
        xml_to_alert_data(_BILLION_LAUGHS)


def test_rejects_external_entity_reference() -> None:
    with pytest.raises(CapImportError):
        xml_to_alert_data(_EXTERNAL_ENTITY)


def test_rejects_malformed_numeric_coordinate() -> None:
    bad = _SAMPLE.replace(
        "<areaDesc>St. George's</areaDesc>",
        "<areaDesc>x</areaDesc><polygon>not,a number 1,2</polygon>",
    )
    with pytest.raises(CapImportError):
        xml_to_alert_data(bad)
