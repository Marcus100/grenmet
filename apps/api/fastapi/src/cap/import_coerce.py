"""Store an imported CAP document that does not fully follow the CAP 1.2 schema.

An import is refused only when it is not well-formed XML or contains a DTD. Any
other problem with the document is stored: the alert gets ``schema_conformant =
false`` and the first schema error (taken from the document as received), so a
forecaster sees what was wrong. We never publish such an alert.

This module makes the document storable by our model. Each value the model cannot
hold as written is replaced with a neutral one, or the element is dropped. A
document that conforms is returned unchanged in meaning.
"""

import re
from datetime import UTC, datetime
from typing import Any

from lxml import etree

from src.cap.models import (
    CapCategory,
    CapCertainty,
    CapMessageType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)

PLACEHOLDER = "Not stated in the imported document"
# A placeholder for list items (addresses) must be one token: the parser splits on spaces.
TOKEN_PLACEHOLDER = "not-stated"
_LANGUAGE = re.compile(r"[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*")


def _values(enum: Any) -> set[str]:
    return {item.value for item in enum}


STATUSES = _values(CapStatus)
MESSAGE_TYPES = _values(CapMessageType)
SCOPES = _values(CapScope)
CATEGORIES = _values(CapCategory)
URGENCIES = _values(CapUrgency)
SEVERITIES = _values(CapSeverity)
CERTAINTIES = _values(CapCertainty)


def _local(element: etree._Element) -> str:
    return etree.QName(element).localname if isinstance(element.tag, str) else ""


def _children(parent: etree._Element, name: str) -> list[etree._Element]:
    return [child for child in parent if _local(child) == name]


def _text(element: etree._Element) -> str:
    return (element.text or "").strip()


def _add(parent: etree._Element, name: str, text: str) -> etree._Element:
    namespace = etree.QName(parent).namespace
    tag = f"{{{namespace}}}{name}" if namespace else name
    child = etree.SubElement(parent, tag)
    child.text = text
    return child


def _ensure_text(parent: etree._Element, name: str, placeholder: str) -> None:
    """Make sure the first ``name`` child has text; add it when missing or empty."""
    existing = _children(parent, name)
    if not existing:
        _add(parent, name, placeholder)
    elif not _text(existing[0]):
        existing[0].text = placeholder


def _drop(element: etree._Element) -> None:
    parent = element.getparent()
    if parent is not None:
        parent.remove(element)


def _coerce_enum(
    parent: etree._Element, name: str, allowed: set[str], default: str
) -> None:
    for element in _children(parent, name):
        if _text(element) not in allowed:
            element.text = default


def _parse_time(text: str) -> datetime | None:
    try:
        value = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    # The schema needs an offset; the publisher treats a naive value as UTC too.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _coerce_time(parent: etree._Element, name: str) -> datetime | None:
    """Return the parsed time of the first ``name`` child, or None after dropping a bad one."""
    elements = _children(parent, name)
    if not elements:
        return None
    value = _parse_time(_text(elements[0]))
    if value is None:
        _drop(elements[0])
        return None
    elements[0].text = value.isoformat()
    return value


def _is_float(text: str) -> bool:
    try:
        float(text)
    except ValueError:
        return False
    return True


def _polygon_ok(text: str) -> bool:
    pairs = text.split()
    return bool(pairs) and all(_pair_floats(pair) for pair in pairs)


def _pair_floats(pair: str) -> bool:
    parts = pair.split(",")
    return len(parts) == 2 and all(_is_float(part) for part in parts)


def _circle_ok(text: str) -> bool:
    point, _, radius = text.partition(" ")
    return _pair_floats(point) and _is_float(radius.strip() or "0")


def _coerce_area(area: etree._Element) -> None:
    _ensure_text(area, "areaDesc", PLACEHOLDER)
    for polygon in _children(area, "polygon"):
        if not _polygon_ok(_text(polygon)):
            _drop(polygon)
    for circle in _children(area, "circle"):
        if not _circle_ok(_text(circle)):
            _drop(circle)
    for name in ("altitude", "ceiling"):
        for element in _children(area, name):
            if not _is_float(_text(element)):
                _drop(element)
    for geocode in _children(area, "geocode"):
        if not _pair_has_values(geocode):
            _drop(geocode)


def _coerce_info(info: etree._Element) -> None:
    language = _children(info, "language")
    if language and not (
        _LANGUAGE.fullmatch(_text(language[0])) and len(_text(language[0])) >= 2
    ):
        language[0].text = "en"
    for name in ("event", "headline", "description"):
        _ensure_text(info, name, PLACEHOLDER)
    _coerce_enum(info, "urgency", URGENCIES, "Unknown")
    _coerce_enum(info, "severity", SEVERITIES, "Unknown")
    _coerce_enum(info, "certainty", CERTAINTIES, "Unknown")
    categories = _children(info, "category")
    for category in categories:
        if _text(category) not in CATEGORIES:
            _drop(category)
    if not _children(info, "category"):
        _add(info, "category", CapCategory.OTHER.value)
    for web in _children(info, "web"):
        if re.search(r"\s|[<>\"]", _text(web)):
            _drop(web)

    effective = _coerce_time(info, "effective")
    onset = _coerce_time(info, "onset")
    expires = _coerce_time(info, "expires")
    if effective and onset and onset < effective:
        _drop(_children(info, "onset")[0])
        onset = None
    if expires and (
        (onset and expires <= onset) or (effective and expires <= effective)
    ):
        _drop(_children(info, "expires")[0])

    for resource in _children(info, "resource"):
        _ensure_text(resource, "resourceDesc", PLACEHOLDER)
        for size in _children(resource, "size"):
            if not _text(size).isdigit():
                _drop(size)
    for parameter in _children(info, "parameter"):
        if not _pair_has_values(parameter):
            _drop(parameter)
    for event_code in _children(info, "eventCode"):
        if not _pair_has_values(event_code):
            _drop(event_code)
    for area in _children(info, "area"):
        _coerce_area(area)


def _pair_has_values(element: etree._Element) -> bool:
    names = _children(element, "valueName")
    values = _children(element, "value")
    return bool(names and values and _text(names[0]) and _text(values[0]))


def coerce_for_import(raw: bytes) -> bytes:
    """The document with its values made storable. Conforming meaning is kept.

    Expects well-formed XML without a DTD (the caller checks that first).
    """
    parser = etree.XMLParser(
        resolve_entities=False, no_network=True, dtd_validation=False
    )
    root = etree.fromstring(raw, parser=parser)
    if _local(root) != "alert":
        return raw  # the field parser refuses a non-alert root with a clear message

    _coerce_enum(root, "status", STATUSES, CapStatus.DRAFT.value)
    _coerce_enum(root, "msgType", MESSAGE_TYPES, CapMessageType.ALERT.value)
    _coerce_enum(root, "scope", SCOPES, CapScope.PUBLIC.value)
    _coerce_time(root, "sent")

    message_type = _children(root, "msgType")
    references = [ref for ref in _children(root, "references") if _text(ref)]
    if (
        message_type
        and _text(message_type[0]) != CapMessageType.ALERT.value
        and not references
    ):
        message_type[0].text = CapMessageType.ALERT.value
    scope = _children(root, "scope")
    if scope and _text(scope[0]) == CapScope.RESTRICTED.value:
        _ensure_text(root, "restriction", PLACEHOLDER)
    if scope and _text(scope[0]) == CapScope.PRIVATE.value:
        addresses = [a for a in _children(root, "addresses") if _text(a)]
        if not addresses:
            _add(root, "addresses", TOKEN_PLACEHOLDER)

    for info in _children(root, "info"):
        _coerce_info(info)
    document: bytes = etree.tostring(root, encoding="UTF-8", xml_declaration=True)
    return document
