"""BUFR for an accepted SYNOP, checked by decoding it again (pure apart from the converter).

The wis2box CSV the register already builds (``encode.wis2_row`` and ``wis2_csv``) is
converted with csv2bufr using the Surface-RA-IV-100 mapping in ``bufr_template/``. The
message is decoded with ecCodes and each element is compared with the observation's
decoded SI values, not with the CSV. A conversion failure or a mismatch is recorded in
the record, and ``sends.load_sendable`` refuses WIS2 and email sends while it is not
valid. The CSV handed to wis2box does not change.

Stored shape (the register's ``bufr`` column):
``{"template", "base64", "checks", "valid", "errors"}``. ``base64`` is None when no
message was produced. ``valid`` is True only when every compared element matches.
"""

import base64
import hashlib
import importlib
import json
import os
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType
from typing import Any

from . import derive, encode, rules
from .config import Wis2boxConfig, wis2box_settings
from .schemas import SynopDecoded, SynopWorkbook

TEMPLATE_NAME = "Surface-RA-IV-100"
TEMPLATE_DIR = Path(__file__).resolve().parent / "bufr_template"
TEMPLATE_PATH = TEMPLATE_DIR / f"{TEMPLATE_NAME}.json"
EXPECTED_EDITION = 4
EXPECTED_SUBSETS = 1

# Tolerances are the resolution of each element in the template, not meteorological
# quality limits. Pressure in Pa, temperature in K, wind speed in m/s, visibility in m,
# precipitation in kg m-2 (mm), humidity and cloud cover in percent.
PRESSURE_TOLERANCE_PA = 1.0
TEMPERATURE_TOLERANCE_K = 0.05
WIND_SPEED_TOLERANCE_MS = 0.051  # half of the 0.1 m/s step plus float slack
DIRECTION_TOLERANCE_DEG = 1.0
VISIBILITY_TOLERANCE_M = 10.0
PRECIPITATION_TOLERANCE_KG_M2 = 0.05
PERCENT_TOLERANCE = 1.0

# The CSV "precipitation" column is template descriptor #3# (the 6RRRtR group: amount for
# the period), not the 1-hour (#1#) or 6-hour (#2#) totals.
PRECIPITATION_KEY = "#3#totalPrecipitationOrTotalWaterEquivalent"

# ecCodes keys read back from the message (decoded with unpack).
IDENTITY_KEYS = (
    "wigosIdentifierSeries",
    "wigosIssuerOfIdentifier",
    "wigosIssueNumber",
    "wigosLocalIdentifierCharacter",
)
TIME_KEYS = ("year", "month", "day", "hour", "minute")
VALUE_KEYS = (
    "nonCoordinatePressure",
    "pressureReducedToMeanSeaLevel",
    "airTemperature",
    "dewpointTemperature",
    "relativeHumidity",
    "windDirection",
    "windSpeed",
    "horizontalVisibility",
    PRECIPITATION_KEY,
    "cloudCoverTotal",
    "presentWeather",
)


class ConversionError(Exception):
    """The message could not be produced or read back."""


@dataclass(frozen=True)
class Check:
    name: str
    expected: float | int | str | None
    actual: float | int | str | None
    tolerance: float
    ok: bool


def _csv2bufr() -> ModuleType:
    # csv2bufr reads its template search path once, at import, from this variable.
    os.environ.setdefault("CSV2BUFR_TEMPLATES", str(TEMPLATE_DIR))
    return importlib.import_module("csv2bufr")


def _eccodes() -> ModuleType:
    return importlib.import_module("eccodes")


def template_descriptors() -> tuple[int, ...]:
    """The unexpanded descriptors the template declares (the header's unexpandedDescriptors)."""
    template = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    for entry in template["header"]:
        if entry["eccodes_key"] == "unexpandedDescriptors":
            return tuple(
                int(item) for item in entry["value"].removeprefix("array:").split(",")
            )
    raise ConversionError("the template declares no unexpandedDescriptors")


def to_bufr(csv_text: str) -> bytes:
    """Convert one wis2box CSV row to one BUFR4 message."""
    mapping = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    try:
        messages = [item["bufr4"] for item in _csv2bufr().transform(csv_text, mapping)]
    except (ValueError, KeyError, TypeError, LookupError, OSError) as error:
        raise ConversionError(f"csv2bufr could not convert the row: {error}") from error
    if len(messages) != 1:
        raise ConversionError(
            f"csv2bufr produced {len(messages)} messages, expected one"
        )
    return bytes(messages[0])


def decode(message: bytes) -> dict[str, Any]:
    """Read back one BUFR message with ecCodes; missing elements are None."""
    ec = _eccodes()
    try:
        handle = ec.codes_new_from_message(message)
    except ec.CodesInternalError as error:
        raise ConversionError(f"ecCodes could not read the message: {error}") from error
    if handle is None:
        raise ConversionError("ecCodes found no BUFR message")
    try:
        ec.codes_set(handle, "unpack", 1)
        values: dict[str, Any] = {
            "edition": int(ec.codes_get(handle, "edition")),
            "subsets": int(ec.codes_get(handle, "numberOfSubsets")),
            "descriptors": tuple(
                int(item)
                for item in ec.codes_get_array(handle, "unexpandedDescriptors")
            ),
        }
        for key in (*IDENTITY_KEYS, *TIME_KEYS, *VALUE_KEYS):
            present = ec.codes_is_defined(handle, key) and not ec.codes_is_missing(
                handle, key
            )
            values[key] = ec.codes_get(handle, key) if present else None
    except ec.CodesInternalError as error:
        raise ConversionError(
            f"ecCodes could not decode the message: {error}"
        ) from error
    finally:
        ec.codes_release(handle)
    return values


def _numeric(
    name: str,
    key: str,
    expected: float | None,
    decoded: dict[str, Any],
    tolerance: float,
) -> Check:
    actual = decoded.get(key)
    if expected is None and actual is None:
        return Check(name, None, None, tolerance, True)
    if expected is None or actual is None:
        return Check(name, expected, actual, tolerance, False)
    return Check(
        name,
        expected,
        float(actual),
        tolerance,
        abs(float(actual) - float(expected)) <= tolerance,
    )


def compare(
    *,
    workbook: SynopWorkbook,
    decoded: SynopDecoded,
    observed_at: datetime,
    config: Wis2boxConfig,
    values: dict[str, Any],
    descriptors: tuple[int, ...],
) -> list[Check]:
    """Every element that the observation reports, against the decoded message."""
    series, issuer, number, local = config.WIS2BOX_WIGOS_ID.split("-", 3)
    checks: list[Check] = [
        Check(
            "edition",
            EXPECTED_EDITION,
            values["edition"],
            0,
            values["edition"] == EXPECTED_EDITION,
        ),
        Check(
            "subsets",
            EXPECTED_SUBSETS,
            values["subsets"],
            0,
            values["subsets"] == EXPECTED_SUBSETS,
        ),
        Check(
            "descriptors",
            ",".join(str(item) for item in descriptors),
            ",".join(str(item) for item in values["descriptors"]),
            0,
            tuple(values["descriptors"]) == descriptors,
        ),
    ]
    identity = (int(series), int(issuer), int(number), int(local))
    for key, expected in zip(IDENTITY_KEYS, identity, strict=True):
        actual = values.get(key)
        checks.append(
            Check(
                key, expected, actual, 0, actual is not None and int(actual) == expected
            )
        )
    moment = observed_at.astimezone(UTC)
    for key, expected in zip(
        TIME_KEYS,
        (moment.year, moment.month, moment.day, moment.hour, moment.minute),
        strict=True,
    ):
        actual = values.get(key)
        checks.append(
            Check(
                key, expected, actual, 0, actual is not None and int(actual) == expected
            )
        )
    checks.extend(
        [
            _numeric(
                "station_pressure_pa",
                "nonCoordinatePressure",
                decoded.station_pressure_pa,
                values,
                PRESSURE_TOLERANCE_PA,
            ),
            _numeric(
                "msl_pressure_pa",
                "pressureReducedToMeanSeaLevel",
                decoded.mean_sea_level_pressure_pa,
                values,
                PRESSURE_TOLERANCE_PA,
            ),
            _numeric(
                "air_temperature_k",
                "airTemperature",
                decoded.air_temperature_k,
                values,
                TEMPERATURE_TOLERANCE_K,
            ),
            _numeric(
                "dew_point_k",
                "dewpointTemperature",
                decoded.dew_point_k,
                values,
                TEMPERATURE_TOLERANCE_K,
            ),
            _numeric(
                "relative_humidity_percent",
                "relativeHumidity",
                decoded.relative_humidity_percent,
                values,
                PERCENT_TOLERANCE,
            ),
            _numeric(
                "wind_direction_deg",
                "windDirection",
                decoded.wind_direction_deg,
                values,
                DIRECTION_TOLERANCE_DEG,
            ),
            _numeric(
                "wind_speed_ms",
                "windSpeed",
                decoded.wind_speed_ms,
                values,
                WIND_SPEED_TOLERANCE_MS,
            ),
            _numeric(
                "visibility_m",
                "horizontalVisibility",
                decoded.visibility_m,
                values,
                VISIBILITY_TOLERANCE_M,
            ),
            _numeric(
                "precipitation_kg_m2",
                PRECIPITATION_KEY,
                decoded.precipitation_kg_m2,
                values,
                PRECIPITATION_TOLERANCE_KG_M2,
            ),
            _numeric(
                "total_cloud_percent",
                "cloudCoverTotal",
                None
                if decoded.total_cloud_percent is None
                else float(decoded.total_cloud_percent),
                values,
                PERCENT_TOLERANCE,
            ),
        ]
    )
    present_wx = (workbook.present_wx or "").strip()
    expected_ww = int(present_wx) if present_wx.isdigit() else None
    checks.append(
        _numeric(
            "present_weather_ww",
            "presentWeather",
            None if expected_ww is None else float(expected_ww),
            values,
            0,
        )
    )
    return [
        check
        for check in checks
        if check.expected is not None or check.actual is not None
    ]


OVERRIDE_KEY = "override"


def record_digest(record: dict[str, Any]) -> str:
    """SHA-256 of the record without its override: the identity an override is bound to.

    The record carries no timestamps, so the same encoding always has the same digest.
    Any change to the message or its checks changes it, which ends the override.
    """
    core = {key: value for key, value in record.items() if key != OVERRIDE_KEY}
    encoded = json.dumps(core, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def override_for(record: dict[str, Any]) -> dict[str, Any] | None:
    """The reviewer override, when it was given for this exact record; else None."""
    override = record.get(OVERRIDE_KEY)
    if not isinstance(override, dict):
        return None
    if override.get("record_sha256") != record_digest(record):
        return None
    return override


def with_override(record: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """The record with a reviewer override added. Nothing else in it changes."""
    return {**record, OVERRIDE_KEY: override}


def carry_over(previous: dict[str, Any], record: dict[str, Any]) -> dict[str, Any]:
    """A re-encoded record keeps the previous override only when it is still the same record."""
    override = previous.get(OVERRIDE_KEY)
    if not isinstance(override, dict):
        return record
    candidate = with_override(record, override)
    return candidate if override_for(candidate) is not None else record


def failed_record(message: str) -> dict[str, Any]:
    return {
        "template": TEMPLATE_NAME,
        "base64": None,
        "checks": [],
        "valid": False,
        "errors": [message],
    }


def _describe(check: Check) -> str:
    return f"{check.name}: observation {check.expected!r}, BUFR {check.actual!r}"


def record_for_row(
    *,
    body: dict[str, Any],
    station: derive.PressureSettings | None,
    observed_at: datetime,
) -> dict[str, Any]:
    """The stored ``bufr`` record for a saved SYNOP body (CPU-bound; run it off the loop)."""
    workbook = encode.workbook_from_body(body)
    _issues, decoded = rules.validate_synop(workbook, station, None, recompute=False)
    try:
        row = encode.wis2_row(
            workbook, decoded, observed_at.astimezone(UTC), wis2box_settings
        )
        message = to_bufr(encode.wis2_csv(row))
        values = decode(message)
        descriptors = template_descriptors()
    except (ConversionError, ValueError, KeyError, TypeError, LookupError) as error:
        return failed_record(str(error))
    checks = compare(
        workbook=workbook,
        decoded=decoded,
        observed_at=observed_at,
        config=wis2box_settings,
        values=values,
        descriptors=descriptors,
    )
    errors = [_describe(check) for check in checks if not check.ok]
    return {
        "template": TEMPLATE_NAME,
        "base64": base64.b64encode(message).decode("ascii"),
        "checks": [asdict(check) for check in checks],
        "valid": not errors,
        "errors": errors,
    }
