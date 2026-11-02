"""Store an imported CAP document that does not fully follow the CAP 1.2 schema.

An import is refused only when it is malformed XML or contains a DTD. Any other
problem is stored: the alert is flagged, and forecasters can see why.

``coerce_for_import`` makes the document storable by our model. Each value the model
cannot hold as written is normalised, replaced with a neutral value, or dropped, and
every such change is returned as text. A document that needed no change returns an
empty list. Changes are recorded in ``schema_error`` and the alert is marked
non-conforming, so an altered import is never mistaken for the document as sent.
"""

import math
import re
from datetime import UTC, datetime
from typing import Any

from lxml import etree

from src.cap.models import (
    CapCategory,
    CapCertainty,
    CapMessageType,
    CapResponseType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)

PLACEHOLDER = "Not stated in the imported document"
# A placeholder for list items (addresses) must be one token: the parser splits on spaces.
TOKEN_PLACEHOLDER = "not-stated"
_LANGUAGE = re.compile(r"[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*")
_WEB_BAD = re.compile(r"\s|[<>\"]")


def _values(enum: Any) -> set[str]:
    return {item.value for item in enum}


STATUSES = _values(CapStatus)
MESSAGE_TYPES = _values(CapMessageType)
SCOPES = _values(CapScope)
CATEGORIES = _values(CapCategory)
URGENCIES = _values(CapUrgency)
SEVERITIES = _values(CapSeverity)
CERTAINTIES = _values(CapCertainty)
RESPONSE_TYPES = {item.value.lower(): item.value for item in CapResponseType}


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


def _ensure_text(
    parent: etree._Element, name: str, placeholder: str, changes: list[str]
) -> None:
    """Make sure the first ``name`` child has text; add the placeholder when missing or empty."""
    existing = _children(parent, name)
    if not existing:
        _add(parent, name, placeholder)
    elif not _text(existing[0]):
        existing[0].text = placeholder
    else:
        return
    changes.append(f"{name} was missing and is recorded as '{placeholder}'")


def _drop(element: etree._Element) -> None:
    parent = element.getparent()
    if parent is not None:
        parent.remove(element)


def _coerce_enum(
    parent: etree._Element,
    name: str,
    allowed: set[str],
    default: str,
    changes: list[str],
) -> None:
    for element in _children(parent, name):
        if _text(element) not in allowed:
            changes.append(
                f"{name} '{_text(element)}' is not a CAP value; set to '{default}'"
            )
            element.text = default


def _parse_time(text: str) -> datetime | None:
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _coerce_time(
    parent: etree._Element, name: str, changes: list[str]
) -> datetime | None:
    """The parsed time of the first ``name`` child; a bad one is dropped and noted."""
    elements = _children(parent, name)
    if not elements:
        return None
    value = _parse_time(_text(elements[0]))
    if value is None:
        changes.append(f"{name} '{_text(elements[0])}' is not a time and was dropped")
        _drop(elements[0])
        return None
    if value.tzinfo is None:
        changes.append(f"{name} has no UTC offset and is taken as UTC")
        value = value.replace(tzinfo=UTC)
    elements[0].text = value.isoformat()
    return value


def _is_finite_number(text: str) -> bool:
    try:
        return math.isfinite(float(text))
    except ValueError:
        return False


def _pair_floats(pair: str) -> bool:
    parts = pair.split(",")
    return len(parts) == 2 and all(_is_finite_number(part) for part in parts)


def _polygon_ok(text: str) -> bool:
    pairs = text.split()
    return bool(pairs) and all(_pair_floats(pair) for pair in pairs)


def _circle_ok(text: str) -> bool:
    point, _, radius = text.partition(" ")
    return _pair_floats(point) and _is_finite_number(radius.strip() or "0")


def _pair_has_values(element: etree._Element) -> bool:
    names = _children(element, "valueName")
    values = _children(element, "value")
    return bool(names and values and _text(names[0]) and _text(values[0]))


def _coerce_area(area: etree._Element, changes: list[str]) -> None:
    _ensure_text(area, "areaDesc", PLACEHOLDER, changes)
    for polygon in _children(area, "polygon"):
        if not _polygon_ok(_text(polygon)):
            changes.append("a polygon could not be read and was dropped")
            _drop(polygon)
    for circle in _children(area, "circle"):
        if not _circle_ok(_text(circle)):
            changes.append("a circle could not be read and was dropped")
            _drop(circle)
    for name in ("altitude", "ceiling"):
        for element in _children(area, name):
            if not _is_finite_number(_text(element)):
                changes.append(
                    f"{name} '{_text(element)}' is not a finite number and was dropped"
                )
                _drop(element)
    for geocode in _children(area, "geocode"):
        if not _pair_has_values(geocode):
            changes.append("a geocode with no name or value was dropped")
            _drop(geocode)


def _coerce_response_types(info: etree._Element, changes: list[str]) -> None:
    """Case and whitespace are normalised; a word that is not a CAP value is dropped."""
    for element in _children(info, "responseType"):
        raw = element.text or ""
        canonical = RESPONSE_TYPES.get(raw.strip().lower())
        if canonical is None:
            changes.append(
                f"responseType '{raw.strip()}' is not a CAP response type and was dropped"
            )
            _drop(element)
        elif raw != canonical:
            changes.append(
                f"responseType '{raw.strip()}' is normalised to '{canonical}'"
            )
            element.text = canonical


def _coerce_info(info: etree._Element, changes: list[str]) -> None:
    language = _children(info, "language")
    if language and not (
        _LANGUAGE.fullmatch(_text(language[0])) and len(_text(language[0])) >= 2
    ):
        changes.append(
            f"language '{_text(language[0])}' is not a language tag; set to 'en'"
        )
        language[0].text = "en"
    for name in ("event", "headline", "description"):
        _ensure_text(info, name, PLACEHOLDER, changes)
    _coerce_enum(info, "urgency", URGENCIES, CapUrgency.UNKNOWN.value, changes)
    _coerce_enum(info, "severity", SEVERITIES, CapSeverity.UNKNOWN.value, changes)
    _coerce_enum(info, "certainty", CERTAINTIES, CapCertainty.UNKNOWN.value, changes)
    for category in _children(info, "category"):
        if _text(category) not in CATEGORIES:
            changes.append(
                f"category '{_text(category)}' is not a CAP category and was dropped"
            )
            _drop(category)
    if not _children(info, "category"):
        changes.append("no valid category; set to 'Other'")
        _add(info, "category", CapCategory.OTHER.value)
    _coerce_response_types(info, changes)
    for web in _children(info, "web"):
        if _WEB_BAD.search(_text(web)):
            changes.append(f"web '{_text(web)}' is not one address and was dropped")
            _drop(web)

    effective = _coerce_time(info, "effective", changes)
    onset = _coerce_time(info, "onset", changes)
    expires = _coerce_time(info, "expires", changes)
    if effective and onset and onset < effective:
        changes.append("onset is before effective and was dropped")
        _drop(_children(info, "onset")[0])
        onset = None
    if expires and onset and expires <= onset:
        changes.append("expires is not after onset and was dropped")
        _drop(_children(info, "expires")[0])
    elif expires and effective and not onset and expires <= effective:
        changes.append("expires is not after effective and was dropped")
        _drop(_children(info, "expires")[0])

    for resource in _children(info, "resource"):
        _ensure_text(resource, "resourceDesc", PLACEHOLDER, changes)
        for size in _children(resource, "size"):
            if not _text(size).isdigit():
                changes.append(
                    f"size '{_text(size)}' is not a whole number and was dropped"
                )
                _drop(size)
    for name in ("parameter", "eventCode"):
        for element in _children(info, name):
            if not _pair_has_values(element):
                changes.append(f"a {name} with no name or value was dropped")
                _drop(element)
    for area in _children(info, "area"):
        _coerce_area(area, changes)


def coerce_for_import(raw: bytes) -> tuple[bytes, list[str]]:
    """The document with its values made storable, and the list of changes made.

    Expects well-formed XML without a DTD (the caller checks that first). A document
    that needed no change comes back with an empty list.
    """
    parser = etree.XMLParser(
        resolve_entities=False, no_network=True, dtd_validation=False
    )
    root = etree.fromstring(raw, parser=parser)
    if _local(root) != "alert":
        return raw, []  # the field parser refuses a non-alert root with a clear message

    changes: list[str] = []
    _coerce_enum(root, "status", STATUSES, CapStatus.DRAFT.value, changes)
    _coerce_enum(root, "msgType", MESSAGE_TYPES, CapMessageType.ALERT.value, changes)
    _coerce_enum(root, "scope", SCOPES, CapScope.PUBLIC.value, changes)
    _coerce_time(root, "sent", changes)

    message_type = _children(root, "msgType")
    references = [ref for ref in _children(root, "references") if _text(ref)]
    if (
        message_type
        and _text(message_type[0]) != CapMessageType.ALERT.value
        and not references
    ):
        changes.append(
            "a message that updates or cancels has no reference; it is stored as an Alert"
        )
        message_type[0].text = CapMessageType.ALERT.value
    scope = _children(root, "scope")
    if scope and _text(scope[0]) == CapScope.RESTRICTED.value:
        _ensure_text(root, "restriction", PLACEHOLDER, changes)
    if scope and _text(scope[0]) == CapScope.PRIVATE.value:
        addresses = [a for a in _children(root, "addresses") if _text(a)]
        if not addresses:
            _add(root, "addresses", TOKEN_PLACEHOLDER)
            changes.append(
                "a Private message has no addresses; recorded as 'not-stated'"
            )

    for info in _children(root, "info"):
        _coerce_info(info, changes)
    document: bytes = etree.tostring(root, encoding="UTF-8", xml_declaration=True)
    return document, changes
