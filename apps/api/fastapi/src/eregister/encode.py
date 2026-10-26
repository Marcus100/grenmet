"""Encoders for a validated SYNOP workbook: FM 12 TAC text and the wis2box CSV.

Pure functions, no I/O. The workbook already holds the coded FM 12 groups as
keyed on the paper register, so the TAC is those groups assembled in section
order; the CSV carries the SI values decoded by ``rules.validate_synop`` in the
column layout of the csv2bufr template ``Surface-RA-IV-100`` (the same layout
SURFACE publishes; see ``docs/operations/eregister-wmo-conformance.md``).
"""

import csv
import io
from datetime import UTC, datetime
from typing import Any

from .config import Wis2boxConfig
from .public import RAIN_PERIOD_HOURS
from .rules import (
    FOUR_DIGIT_GROUP,
    THREE_DIGIT_GROUP,
    TWO_DIGIT_GROUP,
    layer_height_metres,
)
from .schemas import SynopDecoded, SynopWorkbook

# Code table 1600 (h): lower bound in metres of each class of lowest cloud base.
LOWEST_CLOUD_BASE_M = (0, 50, 100, 200, 300, 600, 1000, 1500, 2000, 2500)
FFF_MIN = 99
FIVE_DIGIT_GROUP = 5
STATION_TYPE_MANNED = 1
# 24 h pressure change j1: 8 rise or zero (58), 9 fall (59); validation warns on
# the legacy 0 / 1 keying, which is still encoded the same way.
PRESSURE_24H_RISE_SIGNS = "80"
PRESSURE_24H_FALL_SIGNS = "91"

WIS2_COLUMNS = (
    "wsi_series,wsi_issuer,wsi_issue_number,wsi_local,wmo_block_number,"
    "wmo_station_number,station_type,year,month,day,hour,minute,latitude,"
    "longitude,station_height_above_msl,barometer_height_above_msl,"
    "station_pressure,msl_pressure,24_hour_barometric_change,geopotential_height,"
    "thermometer_height,air_temperature,maximum_air_temperature,"
    "minimum_air_temperature,dewpoint_temperature,wetbulb_temperature,"
    "relative_humidity,method_of_ground_state_measurement,ground_state,"
    "method_of_snow_depth_measurement,snow_depth,present_weather,"
    "precipitation_intensity,precipitation_indicator,precipitation,"
    "precipitation_period_duration,anemometer_height,time_period_of_wind,"
    "wind_direction,wind_speed,maximum_wind_gust_direction_10_minutes,"
    "maximum_wind_gust_speed_10_minutes,maximum_wind_gust_direction_1_hour,"
    "maximum_wind_gust_speed_1_hour,maximum_wind_gust_direction_3_hours,"
    "maximum_wind_gust_speed_3_hours,rain_sensor_height,total_precipitation_1_hour,"
    "total_precipitation_3_hours,total_precipitation_6_hours,"
    "total_precipitation_12_hours,total_precipitation_24_hours,solar_radiation,"
    "soil_temperature_depth_1,soil_temperature_depth_2,soil_temperature_1,"
    "soil_temperature_2,soil_moisture_1,soil_moisture_2,visibility,cloud_cover_tot,"
    "lowest_cloud_height,past_weather_w_1,past_weather_w_2,observed_cloud_coverage,"
    "low_cloud_type,middle_cloud_type,high_cloud_type,state_of_sky,"
    "direction_of_cl_clouds,direction_of_cm_clouds,direction_of_ch_clouds,"
    "cloud_coverage_l1,genus_of_cloud_l1,height_of_cloud_base_l1,cloud_coverage_l2,"
    "genus_of_cloud_l2,height_of_cloud_base_l2,cloud_coverage_l3,genus_of_cloud_l3,"
    "height_of_cloud_base_l3,cloud_coverage_l4,genus_of_cloud_l4,"
    "height_of_cloud_base_l4,special_phenomenon"
).split(",")


def workbook_from_body(body: dict[str, Any]) -> SynopWorkbook:
    """Read a stored observation body (flat, or nested under ``workbook``).

    The stored body is the record: calculated fields are filled in when a body is
    written (create, correct, validate), never on read, so what QC accepted is what
    is encoded and sent even if the formulas change later.
    """
    source = body.get("workbook")
    values = source if isinstance(source, dict) else body
    return SynopWorkbook.model_validate(
        {
            key: value
            for key, value in values.items()
            if key in SynopWorkbook.model_fields and isinstance(value, str)
        }
    )


def _v(workbook: SynopWorkbook, field: str) -> str:
    return (getattr(workbook, field) or "").strip()


def _slashes(value: str, width: int) -> str:
    """Pad a keyed group element: blank or slashes are missing ('/')."""
    if value == "" or set(value) == {"/"}:
        return "/" * width
    return value.rjust(width, "0") if value.isdigit() else value


def _present(value: str) -> bool:
    return value != "" and set(value) != {"/"}


def _temperature_group(prefix: str, value: str) -> str | None:
    """1snTTT style group from TTT (sign 0) or snTTT."""
    if not _present(value):
        return None
    return f"{prefix}{value}" if len(value) == FOUR_DIGIT_GROUP else f"{prefix}0{value}"


def _wind_groups(workbook: SynopWorkbook) -> tuple[str, str | None]:
    """Nddff and, for speeds from 99, the 00fff group."""
    total = _slashes(_v(workbook, "total_cloud"), 1)
    direction = _slashes(_v(workbook, "wind_dir"), 2)
    speed = _v(workbook, "wind_speed")
    extra = None
    if len(speed) == THREE_DIGIT_GROUP:
        extra = f"00{speed}"
        speed = "99"
    return f"{total}{direction}{_slashes(speed, 2)}", extra


def _section1(workbook: SynopWorkbook) -> list[str]:
    groups = [
        _slashes(_v(workbook, "precip_indicator"), 1)
        + _slashes(_v(workbook, "station_wx_indicator"), 1)
        + _slashes(_v(workbook, "cloud_base"), 1)
        + _slashes(_v(workbook, "visibility"), 2)
    ]
    nddff, wind_extra = _wind_groups(workbook)
    groups.append(nddff)
    if wind_extra:
        groups.append(wind_extra)
    air = _temperature_group("1", _v(workbook, "air_temp"))
    dew = _temperature_group("2", _v(workbook, "dew_point"))
    humidity = _v(workbook, "relative_humidity")
    if air:
        groups.append(air)
    if dew:
        groups.append(dew)
    elif _present(humidity):
        groups.append(f"29{humidity.rjust(3, '0')}")
    for prefix, field in (("3", "station_pressure"), ("4", "msl_pressure")):
        if _present(_v(workbook, field)):
            groups.append(f"{prefix}{_v(workbook, field)}")
    if _present(_v(workbook, "pressure_tendency")) or _present(
        _v(workbook, "pressure_change")
    ):
        groups.append(
            "5"
            + _slashes(_v(workbook, "pressure_tendency"), 1)
            + _slashes(_v(workbook, "pressure_change"), 3)
        )
    if _present(_v(workbook, "precip_amount")):
        groups.append(
            "6"
            + _slashes(_v(workbook, "precip_amount"), 3)
            + _slashes(_v(workbook, "precip_period"), 1)
        )
    weather = (
        _v(workbook, "present_wx"),
        _v(workbook, "past_wx_1"),
        _v(workbook, "past_wx_2"),
    )
    if any(_present(item) for item in weather):
        groups.append(
            "7"
            + _slashes(weather[0], 2)
            + _slashes(weather[1], 1)
            + _slashes(weather[2], 1)
        )
    clouds = [
        _v(workbook, field)
        for field in (
            "low_cloud_amount",
            "low_cloud_type",
            "mid_cloud_type",
            "high_cloud_type",
        )
    ]
    if any(_present(item) for item in clouds):
        groups.append("8" + "".join(_slashes(item, 1) for item in clouds))
    return groups


def _section3(workbook: SynopWorkbook) -> list[str]:
    groups: list[str] = []
    sky = [
        _v(workbook, field)
        for field in (
            "s3_state_of_sky",
            "s3_cloud_dir_low",
            "s3_cloud_dir_mid",
            "s3_cloud_dir_high",
        )
    ]
    if any(_present(item) for item in sky):
        groups.append("0" + "".join(_slashes(item, 1) for item in sky))
    for group in (
        _temperature_group("1", _v(workbook, "s3_max_temp")),
        _temperature_group("2", _v(workbook, "s3_min_temp")),
    ):
        if group:
            groups.append(group)
    if _present(_v(workbook, "s3_ground_state")) or _present(
        _v(workbook, "s3_ground_jjj")
    ):
        groups.append(
            "3"
            + _slashes(_v(workbook, "s3_ground_state"), 1)
            + _slashes(_v(workbook, "s3_ground_jjj"), 3)
        )
    if _present(_v(workbook, "s3_sunshine_24h")):
        groups.append(f"55{_v(workbook, 's3_sunshine_24h')}")
    pressure_24h = _pressure_change_group(_v(workbook, "s3_baro_change_24h"))
    if pressure_24h:
        groups.append(pressure_24h)
    if _present(_v(workbook, "s3_rainfall_24h")):
        groups.append(f"7{_v(workbook, 's3_rainfall_24h')}")
    for n in (1, 2, 3, 4):
        layer = [
            _v(workbook, f"s3_layer{n}_amount"),
            _v(workbook, f"s3_layer{n}_form"),
            _v(workbook, f"s3_layer{n}_height"),
        ]
        if any(_present(item) for item in layer):
            groups.append(
                "8"
                + _slashes(layer[0], 1)
                + _slashes(layer[1], 1)
                + _slashes(layer[2], 2)
            )
    groups.extend(_special_phenomena(workbook))
    return groups


def _special_phenomena(workbook: SynopWorkbook) -> list[str]:
    """The 9SpSpspsp groups in ascending SpSp order, each exactly once.

    The gust (910ff, with 00fff after it for 99 and over), the 909 group and the
    typed groups are merged: 909 comes before 910 and a group typed twice, or typed
    as well as built from its own field, is sent once. A 00fff group typed after a
    9SpSpspsp group stays with it. Anything that is not a 9SpSpspsp group follows,
    as keyed.
    """
    units: list[list[str]] = []
    other: list[str] = []
    gust = _v(workbook, "wind_gust")
    if _present(gust):
        units.append([f"910{'99' if len(gust) == THREE_DIGIT_GROUP else gust}"])
        if len(gust) == THREE_DIGIT_GROUP:
            units[-1].append(f"00{gust}")
    group_909 = _v(workbook, "s3_group_909")
    typed = [group_909] if _present(group_909) else []
    typed.extend(_v(workbook, "s3_special_phenomena").split())
    for token in typed:
        if len(token) == FIVE_DIGIT_GROUP and token.isdigit() and token[0] == "9":
            units.append([token])
        elif units and token.startswith("00") and not other:
            units[-1].append(token)
        else:
            other.append(token)
    ordered: list[str] = []
    seen: set[str] = set()
    for unit in sorted(units, key=lambda item: item[0][:3]):
        if unit[0] not in seen:
            seen.add(unit[0])
            ordered.extend(unit)
    return [*ordered, *other]


def _pressure_change_group(value: str) -> str | None:
    """58P24P24P24 (rise or zero) or 59P24P24P24 (fall) from the keyed j1 + P24."""
    if len(value) != FOUR_DIGIT_GROUP or not value.isdigit():
        return None
    if value[0] in PRESSURE_24H_FALL_SIGNS:
        return f"59{value[1:]}"
    if value[0] in PRESSURE_24H_RISE_SIGNS:
        return f"58{value[1:]}"
    return None


def _section5(workbook: SynopWorkbook) -> list[str]:
    """Section 5 national groups: preserved as keyed, never validated."""
    national = " ".join(_v(workbook, "s5_national").split())
    return ["555", national] if national else []


def synop_tac(workbook: SynopWorkbook) -> str:
    """Assemble the FM 12 SYNOP message, ending with '='."""
    head = (
        f"{_v(workbook, 'report_type')} "
        f"{_slashes(_v(workbook, 'day'), 2)}{_slashes(_v(workbook, 'time_utc'), 2)}"
        f"{_slashes(_v(workbook, 'wind_indicator'), 1)} {_v(workbook, 'station_id')}"
    )
    # A NIL report is the identification alone (B/C general (ix)).
    if not any(_present(_v(workbook, f)) for f in _DATA_FIELDS):
        return f"{head} NIL="
    parts = [head, *_section1(workbook)]
    section3 = _section3(workbook)
    if section3:
        parts.extend(["333", *section3])
    parts.extend(_section5(workbook))
    return " ".join(parts) + "="


_DATA_FIELDS = tuple(
    field
    for field in SynopWorkbook.model_fields
    if field
    not in (
        "report_type",
        "day",
        "time_utc",
        "station_id",
        "wind_indicator",
        "s3_remarks",
        "metar_text",
        "notes",
        "observer_initials",
    )
)


def _number(value: float | None, places: int = 2) -> str:
    if value is None:
        return ""
    rounded = round(value, places)
    return str(int(rounded)) if rounded == int(rounded) else str(rounded)


def _int_field(workbook: SynopWorkbook, field: str) -> str:
    value = _v(workbook, field)
    return str(int(value)) if value.isdigit() else ""


def _signed_pascals(value: str) -> float | None:
    """24 h pressure change 'j1 P24P24P24' (tenths of hPa, j1 9 = fall) in Pa."""
    if len(value) != FOUR_DIGIT_GROUP or not value.isdigit():
        return None
    if value[0] in PRESSURE_24H_FALL_SIGNS:
        return -int(value[1:]) * 10.0
    if value[0] in PRESSURE_24H_RISE_SIGNS:
        return int(value[1:]) * 10.0
    return None


def _gust_column(decoded: SynopDecoded) -> str:
    return _number(decoded.wind_gust_ms, 1)


def _lowest_cloud_height(workbook: SynopWorkbook) -> str:
    code = _v(workbook, "cloud_base")
    if not code.isdigit():
        return ""
    return str(LOWEST_CLOUD_BASE_M[int(code)])


def _layer_columns(workbook: SynopWorkbook) -> dict[str, str]:
    columns: dict[str, str] = {}
    for n in (1, 2, 3, 4):
        height = _v(workbook, f"s3_layer{n}_height")
        metres = (
            layer_height_metres(int(height))
            if height.isdigit() and len(height) == TWO_DIGIT_GROUP
            else None
        )
        columns[f"cloud_coverage_l{n}"] = _int_field(workbook, f"s3_layer{n}_amount")
        columns[f"genus_of_cloud_l{n}"] = _int_field(workbook, f"s3_layer{n}_form")
        columns[f"height_of_cloud_base_l{n}"] = _number(metres, 0)
    return columns


def wis2_row(
    workbook: SynopWorkbook,
    decoded: SynopDecoded,
    observed_at: datetime,
    config: Wis2boxConfig,
) -> dict[str, str]:
    """Map one decoded SYNOP to the csv2bufr Surface-RA-IV-100 columns."""
    series, issuer, number, local = config.WIS2BOX_WIGOS_ID.split("-", 3)
    station = _v(workbook, "station_id")
    when = observed_at.astimezone(UTC)
    period = RAIN_PERIOD_HOURS.get(_v(workbook, "precip_period"))
    has_precip = decoded.precipitation_kg_m2 is not None
    wind = decoded.wind_speed_ms is not None
    row = dict.fromkeys(WIS2_COLUMNS, "")
    row.update(
        wsi_series=series,
        wsi_issuer=issuer,
        wsi_issue_number=number,
        wsi_local=local,
        wmo_block_number=str(int(station[:2])),
        wmo_station_number=str(int(station[2:])),
        station_type=str(STATION_TYPE_MANNED),
        year=str(when.year),
        month=str(when.month),
        day=str(when.day),
        hour=str(when.hour),
        minute=str(when.minute),
        latitude=_number(config.WIS2BOX_STATION_LATITUDE, 4),
        longitude=_number(config.WIS2BOX_STATION_LONGITUDE, 4),
        station_height_above_msl=_number(config.WIS2BOX_STATION_HEIGHT_M, 1),
        barometer_height_above_msl=_number(config.WIS2BOX_BAROMETER_HEIGHT_M, 1),
        station_pressure=_number(decoded.station_pressure_pa, 0),
        msl_pressure=_number(decoded.mean_sea_level_pressure_pa, 0),
        thermometer_height=_number(config.WIS2BOX_THERMOMETER_HEIGHT_M, 1),
        air_temperature=_number(decoded.air_temperature_k),
        maximum_air_temperature=_number(decoded.max_temperature_k),
        minimum_air_temperature=_number(decoded.min_temperature_k),
        dewpoint_temperature=_number(decoded.dew_point_k),
        wetbulb_temperature=_number(decoded.wet_bulb_k),
        relative_humidity=_number(decoded.relative_humidity_percent, 0),
        present_weather=_int_field(workbook, "present_wx"),
        precipitation=_number(decoded.precipitation_kg_m2, 1),
        precipitation_period_duration=(
            str(-period) if has_precip and period is not None else ""
        ),
        anemometer_height=(
            _number(config.WIS2BOX_ANEMOMETER_HEIGHT_M, 1) if wind else ""
        ),
        time_period_of_wind="-10" if wind else "",
        wind_direction=_number(decoded.wind_direction_deg, 0),
        wind_speed=_number(decoded.wind_speed_ms, 1),
        maximum_wind_gust_speed_10_minutes=_gust_column(decoded),
        total_precipitation_24_hours=_number(decoded.rainfall_24h_kg_m2, 1),
        visibility=_number(
            None if decoded.visibility_m is None else decoded.visibility_m / 1000, 2
        ),
        cloud_cover_tot=_int_field(workbook, "total_cloud"),
        lowest_cloud_height=_lowest_cloud_height(workbook),
        past_weather_w_1=_int_field(workbook, "past_wx_1"),
        past_weather_w_2=_int_field(workbook, "past_wx_2"),
        observed_cloud_coverage=_int_field(workbook, "low_cloud_amount"),
        low_cloud_type=_int_field(workbook, "low_cloud_type"),
        middle_cloud_type=_int_field(workbook, "mid_cloud_type"),
        high_cloud_type=_int_field(workbook, "high_cloud_type"),
        state_of_sky=_int_field(workbook, "s3_state_of_sky"),
        ground_state=_int_field(workbook, "s3_ground_state"),
        **{
            "24_hour_barometric_change": _number(
                _signed_pascals(_v(workbook, "s3_baro_change_24h")), 0
            ),
            "direction_of_cl_clouds": _cloud_direction(workbook, "s3_cloud_dir_low"),
            "direction_of_cm_clouds": _cloud_direction(workbook, "s3_cloud_dir_mid"),
            "direction_of_ch_clouds": _cloud_direction(workbook, "s3_cloud_dir_high"),
        },
        **_layer_columns(workbook),
    )
    return row


def _cloud_direction(workbook: SynopWorkbook, field: str) -> str:
    """DL/DM/DH 1 to 8 are compass octants (template multiplies by 45)."""
    value = _v(workbook, field)
    return value if value in tuple("12345678") else ""


def wis2_csv(row: dict[str, str]) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=WIS2_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerow(row)
    return out.getvalue()


def wis2_filename(config: Wis2boxConfig, observed_at: datetime) -> str:
    stamp = observed_at.astimezone(UTC).strftime("%Y%m%dT%H%M")
    return f"wmo_data_{config.WIS2BOX_WIGOS_ID}_{stamp}.csv"
