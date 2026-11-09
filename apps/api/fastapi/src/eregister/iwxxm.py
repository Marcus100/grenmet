"""IWXXM 2025-2 METAR and SPECI for a register observation (encoder and XSD check).

The XML is built from the decoded values of the coded SYNOP (``rules.validate_synop``
and ``metar.expected``), not by re-parsing a TAC. It follows the WMO IWXXM schema
2025-2, which implements ICAO Annex 3 Amendment 82, and is checked against the
XSD bundle that ``scripts/fetch_iwxxm_schemas.py`` installs into ``iwxxm_xsd/2025-2``
(gitignored; each file checked against ``iwxxm_schema_manifest.json``). Schematron is
not run yet (it needs an XSLT 2.0 engine; see
docs/operations/eregister-wmo-conformance.md).

Storage contract (the register's ``iwxxm`` column): ``{"version", "xml", "valid",
"errors", "note", "schematron"}``. ``valid`` means no gap was found and the XML passes
the XSD; it is null when the schemas are not installed. It does not mean Schematron
passed. Nothing here sends anything.

Gaps are never dropped silently: an element that cannot be encoded is written as a
nil with a reason, and the gap is listed in ``errors``.
"""

import logging
import threading
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import xmlschema
from defusedxml import ElementTree as safe_et

from . import aerodromes, derive, encode, metar, rules
from .schemas import SynopDecoded, SynopWorkbook

logger = logging.getLogger(__name__)

IWXXM_VERSION = "2025-2"
IWXXM_NAMESPACE = f"http://icao.int/iwxxm/{IWXXM_VERSION}"
SCHEMA_DIR = Path(__file__).resolve().parent / "iwxxm_xsd" / IWXXM_VERSION
SCHEMA_ENTRY = SCHEMA_DIR / "IWXXM" / "iwxxm.xsd"
SCHEMA_LOCATION = (
    f"{IWXXM_NAMESPACE} http://schemas.wmo.int/iwxxm/{IWXXM_VERSION}/iwxxm.xsd"
)
SCHEMATRON_STATUS = "not_run"
SCHEMAS_MISSING_NOTE = (
    "IWXXM XSD schemas not installed; run `python -m scripts.fetch_iwxxm_schemas` "
    "in apps/api/fastapi. Validity is unknown until they are."
)
XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n'

GML_NAMESPACE = "http://www.opengis.net/gml/3.2"
AIXM_NAMESPACE = "http://www.aixm.aero/schema/5.1.1"
XLINK_NAMESPACE = "http://www.w3.org/1999/xlink"
XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance"
for _prefix, _uri in (
    ("iwxxm", IWXXM_NAMESPACE),
    ("gml", GML_NAMESPACE),
    ("aixm", AIXM_NAMESPACE),
    ("xlink", XLINK_NAMESPACE),
    ("xsi", XSI_NAMESPACE),
):
    ET.register_namespace(_prefix, _uri)

ReportKind = Literal["METAR", "SPECI"]

NIL_MISSING = "http://codes.wmo.int/common/nil/missing"
NIL_NOTHING = "http://codes.wmo.int/common/nil/nothingOfOperationalSignificance"
NIL_UNKNOWN = "http://codes.wmo.int/common/nil/unknown"
PRESENT_WEATHER_CODES = "http://codes.wmo.int/306/4678/"
CLOUD_AMOUNT_CODES = "http://codes.wmo.int/49-2/CloudAmountReportedAtAerodrome/"
CUMULONIMBUS_CODE = "http://codes.wmo.int/49-2/SigConvectiveCloudType/CB"
KNOTS = "[kn_i]"
FEET = "[ft_i]"
CAVOK_VISIBILITY_M = 9999  # metar.py scale value for 10 km and over (CAVOK needs 10 km)

# WMO code table 4677 (ww, present weather at the station) to the METAR present weather
# token (code table 4678 as IWXXM uses it). Meanings are from the code table snapshot in
# apps/web/gaa-admin (CCT 2026-06-01). Intensity: slight -, moderate none, heavy +;
# intermittent and continuous share one token because METAR does not carry that
# difference. Codes not listed (ww 06 dust, 20-29 past weather, 91-94 recent
# thunderstorm) are reported as gaps, never guessed. GMS to confirm this table.
PRESENT_WEATHER: dict[int, str] = {
    4: "FU",
    5: "HZ",
    10: "BR",
    17: "TS",
    45: "FG",
    50: "-DZ",
    51: "-DZ",
    52: "DZ",
    53: "DZ",
    54: "+DZ",
    55: "+DZ",
    56: "-FZDZ",
    57: "FZDZ",
    60: "-RA",
    61: "-RA",
    62: "RA",
    63: "RA",
    64: "+RA",
    65: "+RA",
    66: "-FZRA",
    67: "FZRA",
    70: "-SN",
    71: "-SN",
    72: "SN",
    73: "SN",
    74: "+SN",
    75: "+SN",
    80: "-SHRA",
    81: "SHRA",
    82: "+SHRA",
    85: "-SHSN",
    86: "SHSN",
    89: "-SHGR",
    90: "SHGR",
    95: "TSRA",
    96: "TSGR",
    97: "+TSRA",
    99: "+TSGR",
}
NO_SIGNIFICANT_WEATHER = range(0, 4)  # ww 00 to 03: nothing to report

# Explicit entry point per vendored namespace. Several namespaces span many files and the
# entry file imports the rest. Mapping every namespace locally keeps xmlschema from
# fetching anything over the network (the schema is loaded with ``allow="local"``).
_ISO = "externalSchema/schemas.opengis.net/iso/19139/20070417"
_SCHEMA_ENTRY_POINTS: dict[str, str] = {
    IWXXM_NAMESPACE: "IWXXM/iwxxm.xsd",
    GML_NAMESPACE: "externalSchema/schemas.opengis.net/gml/3.2.1/gml.xsd",
    AIXM_NAMESPACE: "externalSchema/aero/aixm/5.1.1/AIXM_Features.xsd",
    "http://def.wmo.int/metce/2013": "externalSchema/schemas.wmo.int/metce/1.2/metce.xsd",
    "http://def.wmo.int/opm/2013": "externalSchema/schemas.wmo.int/opm/1.2/opm.xsd",
    "http://www.opengis.net/om/2.0": "externalSchema/schemas.opengis.net/om/2.0/observation.xsd",
    XLINK_NAMESPACE: "externalSchema/org/w3c/1999/xlink.xsd",
    "http://www.w3.org/XML/1998/namespace": "externalSchema/org/w3c/2001/xml.xsd",
    "http://www.isotc211.org/2005/gco": f"{_ISO}/gco/gco.xsd",
    "http://www.isotc211.org/2005/gmd": f"{_ISO}/gmd/gmd.xsd",
    "http://www.isotc211.org/2005/gsr": f"{_ISO}/gsr/gsr.xsd",
    "http://www.isotc211.org/2005/gss": f"{_ISO}/gss/gss.xsd",
    "http://www.isotc211.org/2005/gts": f"{_ISO}/gts/gts.xsd",
}

_schema_lock = threading.Lock()
_schema: xmlschema.XMLSchema10 | None = None


def _load_schema() -> xmlschema.XMLSchema10:
    """The IWXXM schema, loaded once per process (about 8 s), then reused."""
    global _schema
    with _schema_lock:
        if _schema is None:
            locations = [
                (namespace, str(SCHEMA_DIR / relative))
                for namespace, relative in _SCHEMA_ENTRY_POINTS.items()
            ]
            _schema = xmlschema.XMLSchema10(
                str(SCHEMA_ENTRY), locations=locations, allow="local"
            )
        return _schema


def schema_errors(xml_text: str) -> list[str]:
    """XSD errors for an IWXXM document (empty when it validates)."""
    try:
        document = safe_et.fromstring(xml_text)
    except ET.ParseError as exc:
        return [f"XML is not well formed: {exc}"]
    found: list[str] = []
    for error in _load_schema().iter_errors(document):
        reason = str(error.reason or error).splitlines()[0]
        found.append(f"XSD: {reason[:300]}")
    return found


@dataclass(frozen=True)
class Encoded:
    """A built document before schema validation. ``xml`` is None when none can be built."""

    xml: str | None
    gaps: tuple[str, ...]


def _q(namespace: str, name: str) -> str:
    return f"{{{namespace}}}{name}"


def _id(*parts: str) -> str:
    """A deterministic gml:id, so the same observation always gives the same document."""
    seed = "|".join(("barrels-eregister-iwxxm", IWXXM_VERSION, *parts))
    return f"uuid.{uuid.uuid5(uuid.NAMESPACE_URL, seed)}"


def _sub(
    parent: ET.Element,
    namespace: str,
    name: str,
    text: str | None = None,
    *,
    gml_id: str | None = None,
    **attributes: str,
) -> ET.Element:
    attrib = dict(attributes)
    if gml_id is not None:
        attrib[_q(GML_NAMESPACE, "id")] = gml_id
    element = ET.SubElement(parent, _q(namespace, name), attrib)
    if text is not None:
        element.text = text
    return element


def _href(element: ET.Element, href: str) -> None:
    element.set(_q(XLINK_NAMESPACE, "href"), href)


def _nil(parent: ET.Element, namespace: str, name: str, reason: str) -> ET.Element:
    """A nillable element that is absent: xsi:nil with the nil reason, as IWXXM requires."""
    element = _sub(parent, namespace, name)
    element.set(_q(XSI_NAMESPACE, "nil"), "true")
    element.set("nilReason", reason)
    return element


def _time_instant(parent: ET.Element, name: str, when: datetime, *parts: str) -> None:
    holder = _sub(parent, IWXXM_NAMESPACE, name)
    instant = _sub(holder, GML_NAMESPACE, "TimeInstant", gml_id=_id(*parts))
    _sub(instant, GML_NAMESPACE, "timePosition", when.strftime("%Y-%m-%dT%H:%M:%SZ"))


def _aerodrome(
    parent: ET.Element, aerodrome: aerodromes.Aerodrome, *parts: str
) -> None:
    holder = _sub(parent, IWXXM_NAMESPACE, "aerodrome")
    airport = _sub(
        holder, AIXM_NAMESPACE, "AirportHeliport", gml_id=_id(*parts, "airport")
    )
    timeslice = _sub(airport, AIXM_NAMESPACE, "timeSlice")
    slice_ = _sub(
        timeslice,
        AIXM_NAMESPACE,
        "AirportHeliportTimeSlice",
        gml_id=_id(*parts, "slice"),
    )
    _sub(slice_, GML_NAMESPACE, "validTime")
    _sub(slice_, AIXM_NAMESPACE, "interpretation", "SNAPSHOT")
    _sub(slice_, AIXM_NAMESPACE, "designator", aerodrome.icao)
    _sub(slice_, AIXM_NAMESPACE, "name", aerodrome.name)
    _sub(slice_, AIXM_NAMESPACE, "locationIndicatorICAO", aerodrome.icao)
    arp = _sub(slice_, AIXM_NAMESPACE, "ARP")
    point = _sub(
        arp,
        AIXM_NAMESPACE,
        "ElevatedPoint",
        gml_id=_id(*parts, "arp"),
        srsDimension="2",
        axisLabels="Lat Long",
        srsName="http://www.opengis.net/def/crs/EPSG/0/4326",
    )
    _sub(point, GML_NAMESPACE, "pos", f"{aerodrome.latitude} {aerodrome.longitude}")
    _sub(point, AIXM_NAMESPACE, "elevation", f"{aerodrome.elevation_m}", uom="M")
    _sub(point, AIXM_NAMESPACE, "verticalDatum", aerodrome.vertical_datum)


def _celsius(kelvin: float | None) -> str | None:
    return None if kelvin is None else f"{round(kelvin - 273.15, 1):.1f}"


def _ww(workbook: SynopWorkbook) -> int | None:
    text = (workbook.present_wx or "").strip()
    return int(text) if text.isdigit() else None


def _visibility_metres(want: metar.Expected) -> int | None:
    return want.visibility[0] if want.visibility else None


def _surface_wind(parent: ET.Element, want: metar.Expected, gaps: list[str]) -> None:
    if want.wind is None or want.wind_knots is None:
        _nil(parent, IWXXM_NAMESPACE, "surfaceWind", NIL_MISSING)
        gaps.append("wind not reported (direction or speed missing)")
        return
    holder = _sub(parent, IWXXM_NAMESPACE, "surfaceWind")
    wind = _sub(
        holder,
        IWXXM_NAMESPACE,
        "AerodromeSurfaceWind",
        variableWindDirection="true" if want.wind_variable else "false",
    )
    if not want.wind_variable and want.wind_direction is not None:
        _sub(
            wind,
            IWXXM_NAMESPACE,
            "meanWindDirection",
            str(want.wind_direction),
            uom="deg",
        )
    _sub(wind, IWXXM_NAMESPACE, "meanWindSpeed", str(want.wind_knots), uom=KNOTS)
    if want.gust is not None:
        _sub(wind, IWXXM_NAMESPACE, "windGustSpeed", str(want.gust), uom=KNOTS)


def _visibility(parent: ET.Element, metres: int | None, gaps: list[str]) -> None:
    if metres is None:
        _nil(parent, IWXXM_NAMESPACE, "visibility", NIL_MISSING)
        gaps.append("visibility not reported")
        return
    holder = _sub(parent, IWXXM_NAMESPACE, "visibility")
    horizontal = _sub(holder, IWXXM_NAMESPACE, "AerodromeHorizontalVisibility")
    above = metres >= CAVOK_VISIBILITY_M
    _sub(
        horizontal,
        IWXXM_NAMESPACE,
        "prevailingVisibility",
        "10000" if above else str(metres),
        uom="m",
    )
    if above:
        _sub(horizontal, IWXXM_NAMESPACE, "prevailingVisibilityOperator", "ABOVE")


def _weather_token(ww: int | None, gaps: list[str]) -> str | None:
    if ww is None or ww in NO_SIGNIFICANT_WEATHER:
        return None
    token = PRESENT_WEATHER.get(ww)
    if token is None:
        gaps.append(f"present weather ww {ww:02d} has no METAR mapping yet")
    return token


def _cloud(parent: ET.Element, want: metar.Expected, gaps: list[str]) -> None:
    if want.obscured is not None:
        holder = _sub(parent, IWXXM_NAMESPACE, "cloud")
        aerodrome_cloud = _sub(holder, IWXXM_NAMESPACE, "AerodromeCloud")
        if want.obscured:
            _sub(
                aerodrome_cloud,
                IWXXM_NAMESPACE,
                "verticalVisibility",
                str(want.obscured[-1] * 100),
                uom=FEET,
            )
        else:
            _nil(aerodrome_cloud, IWXXM_NAMESPACE, "verticalVisibility", NIL_UNKNOWN)
            gaps.append("vertical visibility (VV ///) cannot be decoded")
        return
    if want.clear_sky:
        _nil(parent, IWXXM_NAMESPACE, "cloud", NIL_NOTHING)
        return
    if want.cloud_placeholder is not None:
        _nil(parent, IWXXM_NAMESPACE, "cloud", NIL_UNKNOWN)
        gaps.append("cloud layers not keyed (total cloud only)")
        return
    layers = [layer for layer in want.layers if not layer.optional]
    if not layers:
        # Only cloud of no operational significance (above 1500 m, not cumulonimbus).
        _nil(parent, IWXXM_NAMESPACE, "cloud", NIL_NOTHING)
        return
    holder = _sub(parent, IWXXM_NAMESPACE, "cloud")
    aerodrome_cloud = _sub(holder, IWXXM_NAMESPACE, "AerodromeCloud")
    for layer in layers:
        wrapper = _sub(aerodrome_cloud, IWXXM_NAMESPACE, "layer")
        cloud_layer = _sub(wrapper, IWXXM_NAMESPACE, "CloudLayer")
        amount = _sub(cloud_layer, IWXXM_NAMESPACE, "amount")
        _href(amount, f"{CLOUD_AMOUNT_CODES}{layer.word}")
        if layer.shown is None:
            _nil(cloud_layer, IWXXM_NAMESPACE, "base", NIL_UNKNOWN)
            gaps.append(f"{layer.word} base cannot be decoded")
        else:
            _sub(cloud_layer, IWXXM_NAMESPACE, "base", str(layer.shown * 100), uom=FEET)
        if layer.cumulonimbus:
            _href(_sub(cloud_layer, IWXXM_NAMESPACE, "cloudType"), CUMULONIMBUS_CODE)


def _is_cavok(want: metar.Expected, metres: int | None, weather: str | None) -> bool:
    """Annex 3 CAVOK: 10 km and over, no cloud of operational significance, no weather."""
    if metres is None or metres < CAVOK_VISIBILITY_M or weather is not None:
        return False
    if want.obscured is not None or want.cloud_placeholder is not None:
        return False
    return all(layer.optional for layer in want.layers)


def _observation(
    parent: ET.Element,
    workbook: SynopWorkbook,
    decoded: SynopDecoded,
    gaps: list[str],
    *parts: str,
) -> None:
    if decoded.is_nil_report:
        _nil(parent, IWXXM_NAMESPACE, "observation", NIL_MISSING)
        return
    holder = _sub(parent, IWXXM_NAMESPACE, "observation")
    want = metar.expected(workbook, decoded)
    metres = _visibility_metres(want)
    weather = _weather_token(_ww(workbook), gaps)
    cavok = _is_cavok(want, metres, weather)
    report = _sub(
        holder,
        IWXXM_NAMESPACE,
        "MeteorologicalAerodromeObservation",
        gml_id=_id(*parts, "observation"),
        cloudAndVisibilityOK="true" if cavok else "false",
    )

    air = _celsius(decoded.air_temperature_k)
    dew = _celsius(decoded.dew_point_k)
    if air is None:
        _nil(report, IWXXM_NAMESPACE, "airTemperature", NIL_MISSING)
        gaps.append("air temperature not reported")
    else:
        _sub(report, IWXXM_NAMESPACE, "airTemperature", air, uom="Cel")
    if dew is None:
        _nil(report, IWXXM_NAMESPACE, "dewpointTemperature", NIL_MISSING)
        gaps.append("dew point not reported")
    else:
        _sub(report, IWXXM_NAMESPACE, "dewpointTemperature", dew, uom="Cel")
    if want.qnh is None:
        _nil(report, IWXXM_NAMESPACE, "qnh", NIL_MISSING)
        gaps.append("QNH not reported (sea level pressure missing)")
    else:
        _sub(report, IWXXM_NAMESPACE, "qnh", str(want.qnh), uom="hPa")
    _surface_wind(report, want, gaps)
    _visibility(report, metres, gaps)
    if weather is not None:
        _href(
            _sub(report, IWXXM_NAMESPACE, "presentWeather"),
            f"{PRESENT_WEATHER_CODES}{weather}",
        )
    if not cavok:
        _cloud(report, want, gaps)


def encode_report(
    *,
    workbook: SynopWorkbook,
    decoded: SynopDecoded,
    aerodrome_icao: str,
    observed_at: datetime,
    correction: bool,
    kind: ReportKind = "METAR",
) -> Encoded:
    """Build the IWXXM document without the schema check. Pure: no I/O."""
    aerodrome = aerodromes.get(aerodrome_icao)
    if aerodrome is None:
        return Encoded(
            None,
            (f"aerodrome {aerodrome_icao} is not in the aerodrome reference table",),
        )
    when = observed_at.astimezone(UTC).replace(microsecond=0)
    key = (aerodrome.icao, when.isoformat(), kind)
    gaps: list[str] = []
    root = ET.Element(
        _q(IWXXM_NAMESPACE, kind),
        {
            _q(GML_NAMESPACE, "id"): _id("report", *key),
            "reportStatus": "CORRECTION" if correction else "NORMAL",
            "permissibleUsage": "OPERATIONAL",
            "automatedStation": "false",
            _q(XSI_NAMESPACE, "schemaLocation"): SCHEMA_LOCATION,
        },
    )
    _time_instant(root, "issueTime", when, "issue", *key)
    _aerodrome(root, aerodrome, *key)
    _time_instant(root, "observationTime", when, "observation-time", *key)
    _observation(root, workbook, decoded, gaps, *key)
    return Encoded(ET.tostring(root, encoding="unicode"), tuple(gaps))


def schemas_installed() -> bool:
    """Whether the pinned XSD files are present (see scripts/fetch_iwxxm_schemas.py)."""
    return SCHEMA_ENTRY.is_file()


def stored_record(encoded: Encoded) -> dict[str, Any]:
    """The register's ``iwxxm`` value: the document, its verdict and every error found.

    Without the installed schemas the document is still built and kept. ``valid`` is
    then null (unknown), or false when a gap is already known, and ``note`` says why.
    """
    errors = list(encoded.gaps)
    xml_text: str | None = None
    note: str | None = None
    if encoded.xml is not None:
        xml_text = XML_DECLARATION + encoded.xml
        if schemas_installed():
            errors.extend(schema_errors(xml_text))
        else:
            note = SCHEMAS_MISSING_NOTE
    valid: bool | None
    if note is not None and not errors:
        valid = None
    else:
        valid = not errors
    return {
        "version": IWXXM_VERSION,
        "xml": xml_text,
        "valid": valid,
        "errors": errors,
        "note": note,
        "schematron": SCHEMATRON_STATUS,
    }


def record_for_row(
    *,
    body: dict[str, Any],
    station: derive.PressureSettings | None,
    observed_at: datetime,
    aerodrome_icao: str,
    correction: bool,
    kind: ReportKind = "METAR",
) -> dict[str, Any]:
    """The stored ``iwxxm`` record for a saved SYNOP body (CPU-bound; run it off the loop)."""
    workbook = encode.workbook_from_body(body)
    _issues, decoded = rules.validate_synop(workbook, station, None, recompute=False)
    encoded = encode_report(
        workbook=workbook,
        decoded=decoded,
        aerodrome_icao=aerodrome_icao,
        observed_at=observed_at,
        correction=correction,
        kind=kind,
    )
    record = stored_record(encoded)
    if record["valid"] is False:
        logger.warning(
            "eRegister IWXXM not valid: %s",
            "; ".join(record["errors"])[:500],
            extra={"iwxxm_version": IWXXM_VERSION, "aerodrome": aerodrome_icao},
        )
    return record
