from datetime import datetime, timezone
from xml.etree import ElementTree as ET

from src.cap.models import CapMessageType
from src.cap.schemas import (
    CapAlertPublic,
    CapAreaPublic,
    CapInfoPublic,
    CapNameValue,
    CapReferencePublic,
    CapResourcePublic,
)

CAP_NS = "urn:oasis:names:tc:emergency:cap:1.2"
ET.register_namespace("", CAP_NS)


def alert_to_cap_xml(alert: CapAlertPublic) -> str:
    root = ET.Element(_tag("alert"))
    _append(root, "identifier", alert.identifier)
    _append(root, "sender", alert.sender)
    _append(root, "sent", _format_cap_datetime(alert.sent))
    _append(root, "status", alert.status.value)
    _append(root, "msgType", alert.msg_type.value)
    _append(root, "source", alert.source)
    _append(root, "scope", alert.scope.value)
    _append(root, "restriction", alert.restriction)
    for address in alert.addresses:
        _append(root, "addresses", address)
    for code in alert.codes:
        _append(root, "code", code)
    _append(root, "note", alert.note)
    if alert.references:
        _append(root, "references", _format_references(alert.references))
    if alert.incidents:
        _append(root, "incidents", ",".join(alert.incidents))

    if alert.msg_type != CapMessageType.ACK:
        for info in sorted(alert.info, key=lambda item: item.sequence):
            root.append(_info_element(info))

    return ET.tostring(root, encoding="unicode", xml_declaration=True)


def _info_element(info: CapInfoPublic) -> ET.Element:
    element = ET.Element(_tag("info"))
    _append(element, "language", info.language)
    for category in info.categories:
        _append(element, "category", category.value)
    _append(element, "event", info.event)
    for response_type in info.response_types:
        _append(element, "responseType", response_type)
    _append(element, "urgency", info.urgency.value)
    _append(element, "severity", info.severity.value)
    _append(element, "certainty", info.certainty.value)
    _append(element, "audience", info.audience)
    for event_code in info.event_codes:
        element.append(_name_value_element("eventCode", event_code))
    _append(element, "effective", _format_optional_datetime(info.effective))
    _append(element, "onset", _format_optional_datetime(info.onset))
    _append(element, "expires", _format_optional_datetime(info.expires))
    _append(element, "senderName", info.sender_name)
    _append(element, "headline", info.headline)
    _append(element, "description", info.description)
    _append(element, "instruction", info.instruction)
    _append(element, "web", info.web)
    _append(element, "contact", info.contact)
    for parameter in info.parameters:
        element.append(_name_value_element("parameter", parameter))
    for resource in sorted(info.resources, key=lambda item: item.sequence):
        element.append(_resource_element(resource))
    for area in sorted(info.areas, key=lambda item: item.sequence):
        element.append(_area_element(area))
    return element


def _resource_element(resource: CapResourcePublic) -> ET.Element:
    element = ET.Element(_tag("resource"))
    _append(element, "resourceDesc", resource.resource_desc)
    _append(element, "mimeType", resource.mime_type)
    if resource.size is not None:
        _append(element, "size", str(resource.size))
    _append(element, "uri", resource.uri)
    _append(element, "derefUri", resource.deref_uri)
    _append(element, "digest", resource.digest)
    return element


def _area_element(area: CapAreaPublic) -> ET.Element:
    element = ET.Element(_tag("area"))
    _append(element, "areaDesc", area.area_desc)
    for polygon in area.polygons:
        _append(element, "polygon", _format_polygon(polygon))
    for multipolygon in area.multipolygons:
        for polygon in multipolygon:
            _append(element, "polygon", _format_polygon(polygon))
    for circle in area.circles:
        _append(element, "circle", _format_circle(circle))
    for geocode in area.geocodes:
        element.append(_name_value_element("geocode", geocode))
    if area.altitude is not None:
        _append(element, "altitude", _format_number(area.altitude))
    if area.ceiling is not None:
        _append(element, "ceiling", _format_number(area.ceiling))
    return element


def _name_value_element(name: str, item: CapNameValue) -> ET.Element:
    element = ET.Element(_tag(name))
    _append(element, "valueName", item.value_name)
    _append(element, "value", item.value)
    return element


def _append(parent: ET.Element, name: str, value: str | None) -> None:
    if value is None or value == "":
        return
    child = ET.SubElement(parent, _tag(name))
    child.text = value


def _tag(name: str) -> str:
    return f"{{{CAP_NS}}}{name}"


def _format_optional_datetime(value: datetime | None) -> str | None:
    return _format_cap_datetime(value) if value else None


def _format_cap_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _format_references(references: list[CapReferencePublic]) -> str:
    return " ".join(
        f"{reference.sender},{reference.identifier},{_format_cap_datetime(reference.sent)}"
        for reference in sorted(references, key=lambda item: item.sequence)
    )


def _format_polygon(points: list[list[float]]) -> str:
    return " ".join(_format_point(point) for point in points)


def _format_point(point: list[float]) -> str:
    if len(point) < 2:
        return ""
    lon, lat = point[0], point[1]
    return f"{_format_number(lat)},{_format_number(lon)}"


def _format_circle(circle: dict[str, float]) -> str:
    lat = circle.get("lat")
    lon = circle.get("lon")
    radius = circle.get("radius")
    if lat is None and "latitude" in circle:
        lat = circle.get("latitude")
    if lon is None and "longitude" in circle:
        lon = circle.get("longitude")
    if radius is None:
        radius = circle.get("radius_km", 0)
    return f"{_format_number(lat or 0)},{_format_number(lon or 0)} {_format_number(radius or 0)}"


def _format_number(value: float) -> str:
    return f"{value:g}"
