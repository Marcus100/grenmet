from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree as ET

from pydantic import ValidationError

from src.cap.exceptions import CapImportError
from src.cap.models import (
    CapCertainty,
    CapMessageType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)
from src.cap.schemas import (
    CapAlertCreate,
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


# --------------------------------------------------------------------------- #
# CAP XML -> alert data (inverse of alert_to_cap_xml). Keystone for CAP import
# and external-feed ingestion. Namespace-agnostic (matches by local tag name).
# --------------------------------------------------------------------------- #


def xml_to_alert_data(xml: str | bytes) -> CapAlertCreate:
    """Parse CAP 1.x XML into a ``CapAlertCreate``. Raises ``CapImportError``."""
    raw = xml.encode("utf-8") if isinstance(xml, str) else xml
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise CapImportError(f"invalid XML: {exc}") from exc
    if _local(root.tag) != "alert":
        raise CapImportError(f"root element <{_local(root.tag)}> is not a CAP <alert>")

    data: dict[str, Any] = {
        "identifier": _ftext(root, "identifier"),
        "sender": _ftext(root, "sender"),
        "sent": _parse_dt(_ftext(root, "sent")),
        "status": _ftext(root, "status") or CapStatus.DRAFT.value,
        "msg_type": _ftext(root, "msgType") or CapMessageType.ALERT.value,
        "source": _ftext(root, "source"),
        "scope": _ftext(root, "scope") or CapScope.PUBLIC.value,
        "restriction": _ftext(root, "restriction"),
        "addresses": _split_ws(
            " ".join(e.text or "" for e in _fall(root, "addresses"))
        ),
        "codes": [e.text or "" for e in _fall(root, "code") if e.text],
        "note": _ftext(root, "note"),
        "references": _parse_references(_ftext(root, "references")),
        "incidents": _split_ws((_ftext(root, "incidents") or "").replace(",", " ")),
        "info": [_parse_info(info) for info in _fall(root, "info")],
    }
    try:
        return CapAlertCreate.model_validate(data)
    except ValidationError as exc:
        raise CapImportError(f"alert failed validation: {exc}") from exc


def _parse_info(el: ET.Element) -> dict[str, Any]:
    return {
        "language": _ftext(el, "language") or "en",
        "categories": [c.text for c in _fall(el, "category") if c.text],
        "event": _ftext(el, "event") or "",
        "response_types": [r.text for r in _fall(el, "responseType") if r.text],
        "urgency": _ftext(el, "urgency") or CapUrgency.UNKNOWN.value,
        "severity": _ftext(el, "severity") or CapSeverity.UNKNOWN.value,
        "certainty": _ftext(el, "certainty") or CapCertainty.UNKNOWN.value,
        "audience": _ftext(el, "audience"),
        "event_codes": [_parse_nv(x) for x in _fall(el, "eventCode")],
        "effective": _parse_dt(_ftext(el, "effective")),
        "onset": _parse_dt(_ftext(el, "onset")),
        "expires": _parse_dt(_ftext(el, "expires")),
        "sender_name": _ftext(el, "senderName"),
        "headline": _ftext(el, "headline") or "",
        "description": _ftext(el, "description") or "",
        "instruction": _ftext(el, "instruction"),
        "web": _ftext(el, "web"),
        "contact": _ftext(el, "contact"),
        "parameters": [_parse_nv(x) for x in _fall(el, "parameter")],
        "resources": [_parse_resource(x) for x in _fall(el, "resource")],
        "areas": [_parse_area(x) for x in _fall(el, "area")],
    }


def _parse_area(el: ET.Element) -> dict[str, Any]:
    return {
        "area_desc": _ftext(el, "areaDesc") or "",
        "polygons": [_parse_polygon(p.text) for p in _fall(el, "polygon") if p.text],
        "circles": [_parse_circle(c.text) for c in _fall(el, "circle") if c.text],
        "geocodes": [_parse_nv(x) for x in _fall(el, "geocode")],
        "altitude": _to_float(_ftext(el, "altitude")),
        "ceiling": _to_float(_ftext(el, "ceiling")),
    }


def _parse_resource(el: ET.Element) -> dict[str, Any]:
    return {
        "resource_desc": _ftext(el, "resourceDesc") or "",
        "mime_type": _ftext(el, "mimeType") or "application/octet-stream",
        "size": _to_int(_ftext(el, "size")),
        "uri": _ftext(el, "uri"),
        "deref_uri": _ftext(el, "derefUri"),
        "digest": _ftext(el, "digest"),
    }


def _parse_nv(el: ET.Element) -> dict[str, str]:
    return {
        "value_name": _ftext(el, "valueName") or "",
        "value": _ftext(el, "value") or "",
    }


def _parse_references(text: str | None) -> list[dict[str, Any]]:
    if not text:
        return []
    refs: list[dict[str, Any]] = []
    for token in text.split():
        parts = token.split(",")
        if len(parts) >= 3:
            refs.append(
                {
                    "sender": parts[0],
                    "identifier": parts[1],
                    "sent": _parse_dt(parts[2]),
                }
            )
    return refs


def _parse_polygon(text: str) -> list[list[float]]:
    """CAP polygon is space-separated 'lat,lon' pairs; store as [lon, lat]."""
    points: list[list[float]] = []
    for pair in text.split():
        coords = pair.split(",")
        if len(coords) >= 2:
            lat, lon = float(coords[0]), float(coords[1])
            points.append([lon, lat])
    return points


def _parse_circle(text: str) -> dict[str, float]:
    """CAP circle is 'lat,lon radius'."""
    point, _, radius = text.partition(" ")
    coords = point.split(",")
    lat = float(coords[0]) if coords and coords[0] else 0.0
    lon = float(coords[1]) if len(coords) > 1 else 0.0
    return {"lat": lat, "lon": lon, "radius": float(radius or 0)}


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _fall(parent: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in parent if _local(child.tag) == name]


def _ftext(parent: ET.Element, name: str) -> str | None:
    for child in parent:
        if _local(child.tag) == name:
            return child.text.strip() if child.text else None
    return None


def _split_ws(value: str | None) -> list[str]:
    return value.split() if value else []


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CapImportError(f"invalid datetime '{value}': {exc}") from exc


def _to_float(value: str | None) -> float | None:
    return float(value) if value else None


def _to_int(value: str | None) -> int | None:
    return int(value) if value else None
