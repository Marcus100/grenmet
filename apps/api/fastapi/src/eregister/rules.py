"""Register rules for the structured SYNOP workbook.

Observers key FM-12 coded groups exactly as on the paper register (dd=07,
TTT=254, PPPP=0149, VV=65, ww=05). This module checks each entry against the
code tables and ranges, applies the cross-field rules of WMO-No. 306 Vol. I.2
regulation B/C1 (SYNOP in TDCF, template TM 307080) and decodes the coded
groups to the SI values BUFR carries (K, Pa, m s-1, m, kg m-2). The decoded
values are what later BUFR, TAC and IWXXM encoders consume.

Errors are impossible or malformed entries and block saving. Warnings are
reporting-practice rules (B/C1.x "shall" statements that depend on context) and
only advise. A blank field is "not yet entered"; a field of slashes is "not
observed" and decodes to missing. Pure functions only: no I/O.
"""

from collections.abc import Collection, Mapping
from datetime import UTC, datetime
from typing import Literal

from . import derive, hourly, metar
from .schemas import SynopDecoded, SynopValidationIssue, SynopWorkbook

Severity = Literal["error", "warning"]

KNOT_MS = 0.514444
KELVIN = 273.15
IDENTIFICATION = ("report_type", "day", "time_utc", "station_id", "wind_indicator")
# Time marks on the instrument charts are bookkeeping, not observed values.
TIME_MARKS = (
    "time_mark_anemograph",
    "time_mark_barograph",
    "time_mark_rain_recorder",
    "time_mark_thermohygrograph",
)
NOT_DATA = (
    *IDENTIFICATION,
    "s3_remarks",
    "metar_text",
    "notes",
    "observer_initials",
    *TIME_MARKS,
)
# Cb layers (form 9) are reported in addition to the three non-Cb layers (B/C1.4.5.1.1).
CUMULONIMBUS = 9
MAX_NON_CB_LAYERS = 3
MAX_LAYERS = 4
LAYERS = (1, 2, 3, 4)
# Group 8NsChshs height code: 00..50 are 30 m steps, 56..80 are 300 m steps (WMO Code table 1677).
LAYER_HEIGHT_30M_MAX = 50
LAYER_HEIGHT_300M_MIN = 56
LAYER_HEIGHT_300M_MAX = 80
# 81..88: 10 500 m upward in 1500 m steps; 89 is above 21 000 m (lower bound used).
LAYER_HEIGHT_1500M_MIN = 81
LAYER_HEIGHT_1500M_MAX = 89
UNUSED_HEIGHT_CODES = range(51, 56)
PRECIP_TRACE = 990
RAIN_24H_TRACE = 9999
OBSCURED = 9
# Code table 4377 for VV 90..99, metres (lower bound of each class).
# B/C1.4.2.2.2: >70 km converted from TAC is carried as 81 900 m in BUFR.
VISIBILITY_OVER_70KM_M = 81900
UNUSED_VISIBILITY_CODES = range(51, 56)
VISIBILITY_90_99 = (0, 50, 200, 500, 1000, 2000, 4000, 10000, 20000, 50000)
WIND_VARIABLE = 99
WIND_FFF_MIN = 99
DAYS_IN_MONTH_MAX = 31
BAROMETER_REFERENCE_CODE = 5000
STEADY_TENDENCY = 4
# Code table 0200: a = 1 to 3 pressure now higher, 6 to 8 now lower than 3 h ago, so
# ppp cannot be 000; 4 is steady; 0 and 5 allow "the same".
CHANGING_TENDENCY = (1, 2, 3, 6, 7, 8)
# ww 42 to 49 is fog at the station (visibility under 1000 m, 12.2.6.4.13); 40 and 41
# are fog at a distance or in patches, where the visibility at the station can be higher.
FOG_AT_STATION = range(42, 50)
FOG_VISIBILITY_M = 1000
# Code table 3845 sign digit 9: group 2 carries relative humidity (2 9UUU).
HUMIDITY_SIGN = "9"
# Code table 4677 ww used by the cross-checks (WMO-No. 306 Vol I.1, 12.2.6.4).
MIST_WW = 10
PRECIPITATION_WW = (*range(50, 70), *range(80, 100))
THUNDERSTORM_WW = (17, *range(95, 100))
# ww 20 to 27 and 29: precipitation or thunder during the past hour; 50 to 99 now.
RECENT_PRECIPITATION_WW = (*range(20, 28), 29, *range(50, 100))
# CL 3 and 9 are cumulonimbus (Code table 0513).
CUMULONIMBUS_CL = (3, 9)
# Code table 4561: W1 and W2 5 drizzle, 6 rain, 7 snow, 8 showers, 9 thunderstorm.
PRECIPITATION_PAST_WEATHER = range(5, 10)
# Code table 4019: hours covered by the precipitation reference period tR.
PRECIPITATION_PERIOD_HOURS = {1: 6, 2: 12, 3: 18, 4: 24, 5: 1, 6: 2, 7: 3, 8: 9, 9: 15}
THREE_HOURLY_REPORTS = (3, 9, 15, 21)
# 12.4.10.1: the first reported layer any amount (index 0), the second (index 1) three
# oktas or more, the third (index 2) five or more.
LAYER_MINIMUM_OKTAS = {1: 3, 2: 5}
# Fixed digit widths of keyed groups: ff/dd/hh, TTT/fff/ppp, snTTT/PPPP/RRRR.
TWO_DIGIT_GROUP = 2
THREE_DIGIT_GROUP = 3
FOUR_DIGIT_GROUP = 4
MAX_PERCENT = 100
STATION_ID_DIGITS = 5
SYNOP_NOON_HOUR = 12
TEMPERATURE_MIN_C = -90
TEMPERATURE_MAX_C = 60
# Code table 4377 (VV) class boundaries: 00..50 are 100 m steps, 51..55 unused,
# 56..80 are 1 km steps from 6 km (code - 50), 81..88 are 5 km steps from 35 km,
# 89 is over 70 km.
VISIBILITY_100M_MAX = 50
VISIBILITY_1KM_MAX = 80
VISIBILITY_5KM_MAX = 88
VISIBILITY_OVER_70KM_CODE = 89
# Reporting hours at station 78958 (owner decisions, 2026-10-23). All 24 hours are
# observed and keyed by hand. Maximum and minimum temperature (1snTxTxTx,
# 2snTnTnTn) are reported every 6 hours, 24 h rainfall at 12 UTC, the pressure
# tendency group 5appp every 3 hours (main and intermediate hours) and the
# rainfall group 6RRRtR at every main hour. Missing groups advise only.
MAIN_HOURS = (0, 6, 12, 18)
TXTN_REPORT_HOURS = MAIN_HOURS
PRESSURE_CHANGE_HOURS = (0, 3, 6, 9, 12, 15, 18, 21)
RAINFALL_REPORT_HOURS = MAIN_HOURS
RAINFALL_24H_REPORT_HOURS = (SYNOP_NOON_HOUR,)
# The station does not report the daily sunshine group 55SSS (decoded if keyed).
SUNSHINE_MAX_TENTHS = 240
SUNSHINE_DIGITS = 3
# Groups 58P24P24P24 (rise or zero) and 59P24P24P24 (fall), tenths of hPa. The
# keyed field is j1 (8 rise or zero, 9 fall) then P24P24P24: the printed 5 and
# the keyed j1 read 58 or 59 (WMO-No. 306 FM 12; paper register columns 43-44).
PRESSURE_24H_RISE_SIGN = "8"
PRESSURE_24H_FALL_SIGN = "9"
# Rows keyed briefly with 0 (rise) or 1 (fall) are still read, with a warning.
PRESSURE_24H_LEGACY_SIGNS = {"0": PRESSURE_24H_RISE_SIGN, "1": PRESSURE_24H_FALL_SIGN}
# A 24 h pressure change beyond 40 hPa is unheard of away from a tropical
# cyclone core: probably a keying slip.
PRESSURE_24H_PLAUSIBLE_TENTHS = 400
# Group 3Ejjj: E is the state of the ground without snow or ice (Code table
# 0901, 0-9). Frozen ground (4) and glaze (5) are implausible in a warm air mass.
GROUND_FROZEN_MAX_AIR_STATES = (4, 5)
GROUND_FROZEN_MAX_AIR_C = 5.0
GROUND_JJJ_DIGITS = 3
# Group 9SpSpspsp supplementary groups: 910ff / 911ff gust, 960ww weather.
SUPPLEMENTARY_DIGITS = 5
SUPPLEMENTARY_GUST_CODES = {"10": "910ff", "11": "911ff"}
SUPPLEMENTARY_WEATHER_CODE = "60"
# Code table 3778, deciles 00 to 19 (WMO-No. 306 Vol I.1). Time groups point at the
# weather group they describe: 900, 901 and 905 at ww in 7wwW1W2, 902, 904, 906 and 907
# at the 9-group that follows, 903 at the 9-group that precedes.
TIME_GROUPS_FOR_WW = ("00", "01", "05")
TIME_GROUPS_FOR_NEXT = ("02", "04", "06", "07")
TIME_GROUP_FOR_PREVIOUS = "03"
SUPPLEMENTARY_NOT_USED = "08"
SUPPLEMENTARY_PRECIPITATION = "09"
# 910 to 914 give a wind speed ff; at 99 or more a 00fff group follows (note 1).
WIND_SPEED_GROUPS = ("10", "11", "12", "13", "14")
SUPPLEMENTARY_MAX_MEAN = "12"
SUPPLEMENTARY_MIN_MEAN = "14"
SUPPLEMENTARY_DIRECTION = "15"
# Repeating these makes no sense; 913 and 915 are repeated to report a wind change
# (note 3) and time groups repeat before each phenomenon.
NON_REPEATING_SUPPLEMENTARY = ("09", "10", "11", "12", "14")
# Code table 3552 Rt 1 to 9 and Code table 0833 dc 0 to 7 or 9 (8 is not used).
PRECIPITATION_TIME_CODES = "123456789"
PRECIPITATION_DURATION_CODES = "01234567" + "9"
WIDE_SPEED_PREFIX = "00"
WIND_DIRECTION_MAX_TENS = 36
# Paper column 17, barometer as read (hPa): the whole range a barometer can show.
BAROMETER_READING_MIN_HPA = 500.0
BAROMETER_READING_MAX_HPA = 1100.0


class _Checker:
    def __init__(self, workbook: SynopWorkbook) -> None:
        self.workbook = workbook
        self.issues: list[SynopValidationIssue] = []

    def raw(self, field: str) -> str:
        return (getattr(self.workbook, field) or "").strip()

    def add(
        self, field: str, code: str, message: str, severity: Severity = "error"
    ) -> None:
        self.issues.append(
            SynopValidationIssue(
                field=field, code=code, message=message, severity=severity
            )
        )

    def present(self, field: str) -> bool:
        value = self.raw(field)
        return value != "" and set(value) != {"/"}

    def integer(
        self,
        field: str,
        label: str,
        low: int,
        high: int,
        *,
        width: int,
        extra: Collection[int] = (),
    ) -> int | None:
        """Parse a fixed-width digit group; blank and slashes decode to missing."""
        value = self.raw(field)
        if not self.present(field):
            return None
        if not value.isdigit():
            self.add(field, "not_integer", f"{label} must be numeric.")
            return None
        if len(value) != width:
            self.add(
                field,
                "wrong_length",
                f"{label} must be {width} digit{'s' if width > 1 else ''}.",
            )
            return None
        number = int(value)
        if not (low <= number <= high or number in extra):
            self.add(
                field, "out_of_range", f"{label} must be between {low} and {high}."
            )
            return None
        return number

    def wind_speed(self, field: str, label: str) -> int | None:
        """Parse ff (two digits) or fff (three digits, 99 or more; group 00fff)."""
        value = self.raw(field)
        if not self.present(field):
            return None
        if not value.isdigit() or len(value) not in (
            TWO_DIGIT_GROUP,
            THREE_DIGIT_GROUP,
        ):
            self.add(
                field,
                "wrong_length" if value.isdigit() else "not_integer",
                f"{label} must be two digits, or three digits from 099 (group 00fff).",
            )
            return None
        number = int(value)
        if len(value) == THREE_DIGIT_GROUP and number < WIND_FFF_MIN:
            self.add(
                field,
                "wrong_length",
                f"{label} below 99 is two digits; three digits (00fff) start at 099.",
            )
            return None
        if number == WIND_FFF_MIN and len(value) == TWO_DIGIT_GROUP:
            self.add(
                field,
                "speed_needs_fff",
                f"{label} 99 means 99 or more: key the full speed as three digits "
                "(group 00fff) when known.",
                "warning",
            )
        return number

    def percent(self, field: str, label: str) -> int | None:
        """Parse a one to three digit whole percentage (UUU), 0 to 100."""
        value = self.raw(field)
        if not self.present(field):
            return None
        if not value.isdigit() or len(value) > THREE_DIGIT_GROUP:
            self.add(field, "invalid_format", f"{label} must be 0 to 100 per cent.")
            return None
        number = int(value)
        if number > MAX_PERCENT:
            self.add(field, "out_of_range", f"{label} must be between 0 and 100.")
            return None
        return number

    def signed_tenths(self, field: str, label: str) -> float | None:
        """Decode TTT (positive) or snTTT (sn 0 positive, 1 negative) to degrees C."""
        value = self.raw(field)
        if not self.present(field):
            return None
        if not value.isdigit() or len(value) not in (
            THREE_DIGIT_GROUP,
            FOUR_DIGIT_GROUP,
        ):
            self.add(
                field,
                "invalid_format",
                f"{label} must be TTT or snTTT in tenths of a degree (e.g. 254 or 1034).",
            )
            return None
        sign = 1
        if len(value) == FOUR_DIGIT_GROUP:
            if value[0] not in "01":
                self.add(field, "invalid_sign", f"{label} sign digit must be 0 or 1.")
                return None
            sign = -1 if value[0] == "1" else 1
        degrees = sign * int(value[-3:]) / 10
        if sign == -1 and int(value[-3:]) == 0:
            self.add(
                field,
                "negative_zero",
                f"{label}: 0.0 is coded with sign 0 (e.g. 0000), never 1000.",
                "warning",
            )
        if not TEMPERATURE_MIN_C <= degrees <= TEMPERATURE_MAX_C:
            self.add(field, "out_of_range", f"{label} must be between -90 and 60 °C.")
            return None
        return degrees

    def pressure(
        self, field: str, label: str, low: float = 870, high: float = 1085.7
    ) -> float | None:
        """Decode a four-digit tenths-of-hPa group with the thousands omitted."""
        value = self.raw(field)
        if not self.present(field):
            return None
        if not value.isdigit() or len(value) != FOUR_DIGIT_GROUP:
            self.add(
                field,
                "invalid_format",
                f"{label} must be four digits in tenths of hPa.",
            )
            return None
        group = int(value)
        hpa = group / 10 + (0 if group >= BAROMETER_REFERENCE_CODE else 1000)
        if not low <= hpa <= high:
            self.add(
                field,
                "out_of_range",
                f"{label} must be between {low:g} and {high:g} hPa.",
            )
            return None
        return hpa


def _visibility_metres(code: int) -> float:
    if code <= VISIBILITY_100M_MAX:
        return code * 100
    if code <= VISIBILITY_1KM_MAX:
        return (code - 50) * 1000
    if code <= VISIBILITY_5KM_MAX:
        return (30 + (code - 80) * 5) * 1000
    if code == VISIBILITY_OVER_70KM_CODE:
        return VISIBILITY_OVER_70KM_M
    return VISIBILITY_90_99[code - 90]


def layer_height_metres(code: int) -> float | None:
    if code <= LAYER_HEIGHT_30M_MAX:
        return code * 30
    if LAYER_HEIGHT_300M_MIN <= code <= LAYER_HEIGHT_300M_MAX:
        return (code - 50) * 300
    if LAYER_HEIGHT_1500M_MIN <= code <= LAYER_HEIGHT_1500M_MAX:
        return 10500 + (min(code, 88) - 81) * 1500
    return None


def _to_int(value: str) -> int | None:
    return int(value) if value.isdigit() else None


def _tenths_or_none(value: str) -> float | None:
    number = _to_int(value)
    if number is None or len(value) != SUNSHINE_DIGITS or number > SUNSHINE_MAX_TENTHS:
        return None
    return number / 10


def _subcategory(hour: int | None) -> int | None:
    """International data sub-category, B/C1.1.1 note 1."""
    if hour is None:
        return None
    if hour % 6 == 0:
        return 2
    if hour % 3 == 0:
        return 1
    return 0


def _check_identification(c: _Checker) -> tuple[int | None, int | None]:
    report_type = c.raw("report_type")
    if report_type == "":
        c.add("report_type", "required", "Report indicator is required.")
    elif report_type not in ("AAXX", "BBXX", "OOXX"):
        c.add(
            "report_type", "invalid_code", "Use AAXX, BBXX, or OOXX for this workbook."
        )
    day = c.integer("day", "Day", 1, DAYS_IN_MONTH_MAX, width=2)
    hour = c.integer("time_utc", "UTC hour", 0, 23, width=2)
    for field, label in (("day", "Day"), ("time_utc", "UTC hour")):
        if c.raw(field) == "":
            c.add(field, "required", f"{label} is required.")
    station = c.raw("station_id")
    if station == "":
        c.add("station_id", "required", "Station identifier is required (B/C1.2.1).")
    elif len(station) != STATION_ID_DIGITS or not station.isdigit():
        c.add(
            "station_id", "invalid_station", "Station identifier must be five digits."
        )
    c.integer("wind_indicator", "Wind indicator iw", 0, 4, width=1)
    if c.present("wind_indicator") and c.raw("wind_indicator") == "2":
        c.add(
            "wind_indicator", "invalid_code", "Wind indicator iw must be 0, 1, 3 or 4."
        )
    return day, hour


def _check_wind(c: _Checker) -> tuple[int | None, float | None, float | None]:
    direction = c.integer(
        "wind_dir",
        "Wind direction (tens of degrees)",
        0,
        36,
        width=2,
        extra=(WIND_VARIABLE,),
    )
    speed = c.wind_speed("wind_speed", "Wind speed")
    if direction is not None and speed is not None and (direction == 0) != (speed == 0):
        c.add(
            "wind_dir",
            "inconsistent_calm",
            "Direction 00 and speed 00 are reported together for calm.",
        )
    indicator = c.raw("wind_indicator")
    if speed is not None and indicator == "":
        c.add(
            "wind_indicator",
            "missing_unit",
            "Wind indicator iw gives the unit of wind speed.",
            "warning",
        )
    gust = c.wind_speed("wind_gust", "Wind gust")
    if gust is not None and speed is not None and gust < speed:
        c.add(
            "wind_gust",
            "gust_below_mean",
            "Gust speed is normally not below the mean wind speed.",
            "warning",
        )

    def to_ms(value: int | None) -> float | None:
        if value is None:
            return None
        if indicator in ("0", "1"):
            return float(value)
        if indicator in ("3", "4"):
            return round(value * KNOT_MS, 1)
        return None

    # B/C1.10.5.3.2: calm is direction 0 and speed 0; variable is direction 0
    # with a positive speed, which TAC reports as dd 99.
    degrees = (
        None
        if direction is None
        else 0
        if direction == WIND_VARIABLE
        else direction * 10
    )
    return degrees, to_ms(speed), to_ms(gust)


def _check_visibility_km(c: _Checker) -> None:
    if (
        c.present("visibility_km")
        and derive.parse_visibility_km(c.raw("visibility_km")) is None
    ):
        c.add(
            "visibility_km",
            "invalid_km",
            "Visibility must be a number of kilometres, for example 12 or 0.8.",
        )


def _check_barometer_reading(c: _Checker) -> None:
    """Paper column 17: the barometer as read, hPa with one decimal (corrections are separate)."""
    value = c.raw("barometer_reading")
    if not c.present("barometer_reading"):
        return
    try:
        hpa = float(value)
    except ValueError:
        hpa = None
    if (
        hpa is None
        or not value.replace(".", "", 1).isdigit()
        or not BAROMETER_READING_MIN_HPA <= hpa <= BAROMETER_READING_MAX_HPA
    ):
        c.add(
            "barometer_reading",
            "invalid_barometer",
            "Barometer as read is a pressure in hPa between "
            f"{BAROMETER_READING_MIN_HPA:g} and {BAROMETER_READING_MAX_HPA:g}, "
            "for example 1013.2.",
        )


def _check_group_909(c: _Checker) -> None:
    value = c.raw("s3_group_909")
    if not c.present("s3_group_909"):
        return
    if not (
        value.isdigit()
        and len(value) == SUPPLEMENTARY_DIGITS
        and value.startswith("909")
    ):
        c.add(
            "s3_group_909",
            "invalid_format",
            "Precipitation timing and duration (909Rtdc) is five digits starting 909.",
        )
        return
    _check_precipitation_timing(c, "s3_group_909", value)


def _check_precipitation_timing(c: _Checker, field: str, token: str) -> None:
    """909Rtdc: when the rain began or ended (Code table 3552) and how long (0833)."""
    time_code, duration = token[3], token[4]
    if time_code not in PRECIPITATION_TIME_CODES:
        c.add(
            field,
            "invalid_909",
            f"{token}: Rt is 1 to 9 (Code table 3552): the time the rain began or "
            "ended, from less than 1 hour to more than 12 hours before the report, "
            "or 9 for unknown.",
        )
    if duration not in PRECIPITATION_DURATION_CODES:
        c.add(
            field,
            "invalid_909",
            f"{token}: dc is 0 to 7 or 9 (Code table 0833); 8 is not used.",
        )
    if not c.present("precip_amount") or c.raw("precip_indicator") in ("3", "4"):
        c.add(
            field,
            "group_909_without_rainfall",
            f"{token}: group 909 describes the precipitation given by 6RRRtR, so key "
            "the rainfall group too (Code table 3778).",
            "warning",
        )


def _check_clouds(c: _Checker) -> int | None:
    total = c.integer("total_cloud", "Total cloud N", 0, 9, width=1)
    low = c.integer("low_cloud_amount", "Low cloud amount Nh", 0, 9, width=1)
    c.integer("cloud_base", "Lowest cloud height h", 0, 9, width=1)
    types = {}
    for field, label in (
        ("low_cloud_type", "Low cloud type CL"),
        ("mid_cloud_type", "Middle cloud type CM"),
        ("high_cloud_type", "High cloud type CH"),
    ):
        types[field] = c.integer(field, label, 0, 9, width=1)
    # Code figure 0 of CL/CM/CH is "no cloud of that kind": a type cannot be
    # reported when there is no cloud (N=0), nor CL/CM when Nh=0 (Nh counts CL, else CM).
    absent = (
        ("low_cloud_type", "mid_cloud_type", "high_cloud_type")
        if total == 0
        else ("low_cloud_type", "mid_cloud_type")
        if low == 0
        else ()
    )
    for field in absent:
        if types[field] not in (None, 0):
            c.add(
                field,
                "type_without_cloud",
                "Cloud type must be 0 when "
                + (
                    "total cloud N is 0."
                    if total == 0
                    else "Nh is 0 (no CL or CM cloud)."
                ),
            )
    if total == 0:
        if low not in (None, 0):
            c.add(
                "low_cloud_amount",
                "inconsistent_cloud",
                "Low cloud amount must be 0 when total cloud is 0.",
            )
        if c.present("cloud_base"):
            c.add(
                "cloud_base",
                "base_without_cloud",
                "Lowest cloud height is missing (/) when total cloud is 0 (B/C1.4.4.4.2).",
                "warning",
            )
    elif total is not None and low is not None and total != OBSCURED:
        if low > total and low != OBSCURED:
            c.add(
                "low_cloud_amount",
                "inconsistent_cloud",
                "Low cloud amount cannot exceed total cloud.",
            )
    if total == OBSCURED and low not in (None, OBSCURED):
        c.add(
            "low_cloud_amount",
            "obscured_sky",
            "Report low cloud amount 9 when the sky is obscured (B/C1.4.4.3.1).",
            "warning",
        )
    return total


def _check_layers(c: _Checker, total: int | None) -> None:
    forms: list[int] = []
    heights: list[float] = []
    entries: list[tuple[int, int | None, int | None]] = []
    previous_present = True
    for n in LAYERS:
        amount = c.integer(f"s3_layer{n}_amount", f"Layer {n} amount", 0, 9, width=1)
        form = c.integer(f"s3_layer{n}_form", f"Layer {n} form", 0, 9, width=1)
        code = c.integer(f"s3_layer{n}_height", f"Layer {n} height", 0, 99, width=2)
        present = amount is not None or form is not None or code is not None
        if present and not previous_present:
            c.add(
                f"s3_layer{n}_amount",
                "layer_gap",
                f"Layer {n} is entered without layer {n - 1}.",
                "warning",
            )
        if present and None in (amount, form, code):
            c.add(
                f"s3_layer{n}_amount",
                "incomplete_layer",
                f"Layer {n} needs amount, form and height (B/C1.4.5.2).",
                "warning",
            )
        if total == 0 and amount not in (None, 0):
            c.add(
                f"s3_layer{n}_amount",
                "inconsistent_cloud",
                "No cloud layers are reported when total cloud is 0.",
            )
        elif (
            amount is not None
            and total is not None
            and total != OBSCURED
            and amount != OBSCURED
            and amount > total
        ):
            c.add(
                f"s3_layer{n}_amount",
                "layer_exceeds_total",
                f"Layer {n} amount cannot exceed total cloud N.",
            )
        if amount == 0 and (form is not None or code is not None):
            c.add(
                f"s3_layer{n}_amount",
                "layer_amount_zero",
                f"Layer {n} amount Ns is 1 to 8 oktas (9 for an obscured sky).",
            )
        if code in UNUSED_HEIGHT_CODES:
            c.add(
                f"s3_layer{n}_height",
                "unused_code",
                f"Layer {n} height codes 51 to 55 are not used (Code table 1677).",
            )
        previous_present = present
        if present:
            entries.append((n, amount, form))
        if form is not None:
            forms.append(form)
        metres = None if code is None else layer_height_metres(code)
        if metres is not None and form != CUMULONIMBUS:
            if heights and metres < heights[-1]:
                c.add(
                    f"s3_layer{n}_height",
                    "layer_order",
                    "Cloud layers are reported from lower to higher (B/C1.4.5.1.3).",
                    "warning",
                )
            heights.append(metres)
    non_cb = [f for f in forms if f != CUMULONIMBUS]
    if len(non_cb) > MAX_NON_CB_LAYERS or len(forms) > MAX_LAYERS:
        c.add(
            "s3_layer4_amount",
            "too_many_layers",
            "At most three non-Cumulonimbus layers plus Cumulonimbus (B/C1.4.5.1.1).",
        )
    _check_layer_selection(c, total, entries)


def _check_layer_selection(
    c: _Checker, total: int | None, entries: list[tuple[int, int | None, int | None]]
) -> None:
    """Which layers are reported (WMO-No. 306 Vol I.1, 12.4.10.1 and 12.4.10.5)."""
    ordinary = [
        (n, amount)
        for n, amount, form in entries
        if form != CUMULONIMBUS and amount not in (None, OBSCURED)
    ]
    for position, (n, amount) in enumerate(ordinary):
        floor = LAYER_MINIMUM_OKTAS.get(position)
        if floor is not None and amount is not None and amount < floor:
            c.add(
                f"s3_layer{n}_amount",
                "layer_amount_too_small",
                f"The {'second' if position == 1 else 'third'} reported layer is "
                f"reported only when it covers {floor} oktas or more (12.4.10.1).",
                "warning",
            )
    if _to_int(c.raw("low_cloud_type")) in CUMULONIMBUS_CL and not any(
        form == CUMULONIMBUS for _, _, form in entries
    ):
        c.add(
            f"s3_layer{min(len(entries) + 1, len(LAYERS))}_form",
            "cumulonimbus_not_reported",
            "Cumulonimbus is always reported: add a layer of type 9 with its amount "
            "and base (12.4.10.1).",
            "warning",
        )
    for layer, layer_amount, layer_form in entries:
        if layer_amount == OBSCURED and layer_form is not None:
            c.add(
                f"s3_layer{layer}_form",
                "obscured_layer_form",
                "An obscured sky is reported 89/hshs: the cloud type is / and hshs "
                "is the vertical visibility (12.4.10.5).",
                "warning",
            )
    raw_total = c.raw("total_cloud")
    if raw_total and set(raw_total) == {"/"} and entries:
        c.add(
            "s3_layer1_amount",
            "cloud_not_observed",
            "Cloud was not observed (N is /), so no 8-group is reported (12.4.10.5).",
            "warning",
        )
    if total == OBSCURED and not any(amount == OBSCURED for _, amount, _ in entries):
        c.add(
            "s3_layer1_amount",
            "obscured_needs_group",
            "The sky is obscured (N=9): report the group 89/hshs with the vertical "
            "visibility (12.4.10.5).",
            "warning",
        )


def _check_precipitation(
    c: _Checker, hour: int | None
) -> tuple[float | None, float | None]:
    c.integer("precip_indicator", "Precipitation indicator iR", 0, 4, width=1)
    c.integer("station_wx_indicator", "Station/weather indicator ix", 1, 7, width=1)
    amount = c.integer("precip_amount", "Precipitation RRR", 0, 999, width=3)
    c.integer("precip_period", "Precipitation period tR", 1, 9, width=1)
    indicator = c.raw("precip_indicator")
    if indicator in ("0", "1", "2") and c.raw("precip_amount") == "":
        c.add(
            "precip_amount",
            "missing_group",
            f"iR={indicator} means the 6RRRtR group is included"
            + (
                " (sections 1 and 3)."
                if indicator == "0"
                else " (section 1)."
                if indicator == "1"
                else " (section 3)."
            ),
            "warning",
        )
    if hour in RAINFALL_REPORT_HOURS:
        if indicator in ("3", "4"):
            c.add(
                "precip_indicator",
                "rainfall_omitted_at_main_hour",
                "Rainfall (6RRRtR) is reported at every main hour (00, 06, 12, 18 "
                f"UTC); iR={indicator} omits it. Use iR 0, 1 or 2.",
                "warning",
            )
        elif indicator not in ("0", "1", "2") and c.raw("precip_amount") == "":
            c.add(
                "precip_amount",
                "missing_rainfall",
                "Rainfall (6RRRtR) is reported at every main hour (00, 06, 12, 18 UTC).",
                "warning",
            )
    if indicator in ("3", "4") and c.present("precip_amount"):
        c.add(
            "precip_amount",
            "indicator_conflict",
            f"iR={indicator} means 6RRRtR is omitted; clear the group or set iR to 0, 1 or 2 "
            "(Code table 1819).",
        )
    if amount is not None and c.raw("precip_period") == "":
        c.add(
            "precip_period",
            "missing_period",
            "Precipitation needs its reference period tR.",
            "warning",
        )
    rainfall_24h = None
    rain = c.raw("s3_rainfall_24h")
    if c.present("s3_rainfall_24h"):
        if not rain.isdigit() or len(rain) != FOUR_DIGIT_GROUP:
            c.add(
                "s3_rainfall_24h",
                "invalid_format",
                "24 h rainfall must be four digits in tenths of mm (9999 = trace).",
            )
        else:
            rainfall_24h = -0.1 if int(rain) == RAIN_24H_TRACE else int(rain) / 10
    elif rain == "" and hour in RAINFALL_24H_REPORT_HOURS:
        c.add(
            "s3_rainfall_24h",
            "missing_24h_rainfall",
            "24 h rainfall is expected at the 12 UTC main hour (B/C1.4.3.2.1).",
            "warning",
        )
    if c.present("s3_rainfall_24h") and hour not in (None, *RAINFALL_24H_REPORT_HOURS):
        c.add(
            "s3_rainfall_24h",
            "rainfall_24h_hour",
            "24 h rainfall is reported once a day, at 12 UTC.",
            "warning",
        )
    precipitation = None
    if amount is not None:
        if amount == PRECIP_TRACE:
            precipitation = -0.1
        elif amount > PRECIP_TRACE:
            precipitation = (amount - PRECIP_TRACE) / 10
        else:
            precipitation = float(amount)
    return precipitation, rainfall_24h


def _check_section3(
    c: _Checker, hour: int | None, air: float | None
) -> tuple[float | None, float | None, float | None]:
    c.integer("s3_state_of_sky", "State of sky Cs", 0, 9, width=1)
    for field, label in (
        ("s3_cloud_dir_low", "Low cloud direction DL"),
        ("s3_cloud_dir_mid", "Middle cloud direction DM"),
        ("s3_cloud_dir_high", "High cloud direction DH"),
    ):
        c.integer(field, label, 0, 9, width=1)
    tmax = c.signed_tenths("s3_max_temp", "Maximum temperature")
    tmin = c.signed_tenths("s3_min_temp", "Minimum temperature")
    if tmax is not None and tmin is not None and tmax < tmin:
        c.add(
            "s3_max_temp",
            "max_below_min",
            "Maximum temperature cannot be below the minimum.",
        )
    _check_temperature_extremes(c, hour, air, tmax, tmin)
    change_pa = _check_pressure_change_24h(c)
    _check_sunshine_and_ground(c, air)
    return tmax, tmin, change_pa


def _check_temperature_extremes(
    c: _Checker,
    hour: int | None,
    air: float | None,
    tmax: float | None,
    tmin: float | None,
) -> None:
    """Groups 1snTxTxTx and 2snTnTnTn: report hour and consistency with the air temperature."""
    for field, value in (("s3_max_temp", tmax), ("s3_min_temp", tmin)):
        if value is not None and hour is not None and hour not in TXTN_REPORT_HOURS:
            c.add(
                field,
                "txtn_hour",
                "Maximum and minimum temperatures are reported every 6 hours "
                "(00, 06, 12, 18 UTC).",
                "warning",
            )
        elif value is None and hour in TXTN_REPORT_HOURS and not c.present(field):
            c.add(
                field,
                "missing_txtn",
                "Maximum and minimum temperatures are reported every 6 hours "
                "(00, 06, 12, 18 UTC).",
                "warning",
            )
    if air is not None and tmax is not None and air > tmax:
        c.add(
            "s3_max_temp",
            "air_above_max",
            "The air temperature at the report time is above the maximum for a "
            "period that ends at the report.",
            "warning",
        )
    if air is not None and tmin is not None and air < tmin:
        c.add(
            "s3_min_temp",
            "air_below_min",
            "The air temperature at the report time is below the minimum for a "
            "period that ends at the report.",
            "warning",
        )


def _check_pressure_change_24h(c: _Checker) -> float | None:
    """Groups 58P24P24P24 (rise or zero) and 59P24P24P24 (fall), as j1 + P24P24P24."""
    field = "s3_baro_change_24h"
    change = c.raw(field)
    if not c.present(field):
        return None
    if not change.isdigit() or len(change) != FOUR_DIGIT_GROUP:
        c.add(
            field,
            "invalid_format",
            "24 h pressure change must be four digits: j1 (8 rise or zero, 9 fall) "
            "then P24P24P24 in tenths of hPa (groups 58 and 59).",
        )
        return None
    sign, tenths = change[0], int(change[1:])
    if sign in PRESSURE_24H_LEGACY_SIGNS:
        c.add(
            field,
            "legacy_sign",
            f"24 h pressure change j1 {sign} is read as {PRESSURE_24H_LEGACY_SIGNS[sign]}"
            ": the register keys j1 as 8 (rise or zero, group 58) or 9 (fall, "
            "group 59). Rekey it.",
            "warning",
        )
        sign = PRESSURE_24H_LEGACY_SIGNS[sign]
    if sign not in (PRESSURE_24H_RISE_SIGN, PRESSURE_24H_FALL_SIGN):
        c.add(
            field,
            "invalid_sign",
            "24 h pressure change j1 is 8 (rise or zero, group 58) or 9 "
            "(fall, group 59).",
        )
        return None
    if sign == PRESSURE_24H_FALL_SIGN and tenths == 0:
        c.add(
            field,
            "negative_zero",
            "A 24 h change of 0.0 is group 58 (j1 8), never group 59.",
            "warning",
        )
    if tenths > PRESSURE_24H_PLAUSIBLE_TENTHS:
        c.add(
            field,
            "implausible_change",
            "A 24 h pressure change above 40 hPa is unusual: check the digits.",
            "warning",
        )
    magnitude = tenths * 10.0
    return -magnitude if sign == PRESSURE_24H_FALL_SIGN else magnitude


def _check_sunshine_and_ground(c: _Checker, air: float | None) -> None:
    sunshine = c.raw("s3_sunshine_24h")
    if c.present("s3_sunshine_24h"):
        if not sunshine.isdigit() or len(sunshine) != SUNSHINE_DIGITS:
            c.add(
                "s3_sunshine_24h",
                "invalid_format",
                "Sunshine 55SSS is three digits: hours and tenths in the past 24 h "
                "(e.g. 087).",
            )
        elif int(sunshine) > SUNSHINE_MAX_TENTHS:
            c.add(
                "s3_sunshine_24h",
                "out_of_range",
                "Sunshine cannot exceed 24.0 hours in 24 hours (SSS 240).",
            )
        else:
            c.add(
                "s3_sunshine_24h",
                "sunshine_not_reported",
                "This station does not report the daily sunshine group 55SSS.",
                "warning",
            )
    state = c.integer("s3_ground_state", "State of the ground E", 0, 9, width=1)
    jjj = c.raw("s3_ground_jjj")
    if c.present("s3_ground_jjj"):
        if not jjj.isdigit() or len(jjj) != GROUND_JJJ_DIGITS:
            c.add(
                "s3_ground_jjj",
                "invalid_format",
                "3Ejjj: jjj is three digits (regional use, e.g. snTgTg minimum "
                "ground temperature).",
            )
        elif not c.present("s3_ground_state"):
            c.add(
                "s3_ground_state",
                "missing_group",
                "Group 3Ejjj needs the state of the ground E (Code table 0901).",
                "warning",
            )
    if (
        state in GROUND_FROZEN_MAX_AIR_STATES
        and air is not None
        and air > GROUND_FROZEN_MAX_AIR_C
    ):
        c.add(
            "s3_ground_state",
            "ground_state_air",
            f"Ground state {state} (frozen or glaze) with an air temperature "
            f"above {GROUND_FROZEN_MAX_AIR_C:g} °C is implausible.",
            "warning",
        )


def _supplementary_group(token: str) -> bool:
    return (
        token.isdigit() and len(token) == SUPPLEMENTARY_DIGITS and token.startswith("9")
    )


def _check_supplementary(c: _Checker, speed: int | None) -> None:
    """Groups 9SpSpspsp of Code table 3778: format, order, ranges and wind groups."""
    tokens = c.raw("s3_special_phenomena").split()
    field = "s3_special_phenomena"
    seen: set[str] = set()
    wide_after: str | None = None
    for index, token in enumerate(tokens):
        if wide_after is not None:
            owner, wide_after = wide_after, None
            if (
                token.isdigit()
                and len(token) == SUPPLEMENTARY_DIGITS
                and token.startswith(WIDE_SPEED_PREFIX)
            ):
                continue  # the 00fff group that follows ff = 99
            c.add(
                field,
                "speed_needs_fff",
                f"{owner}: ff 99 means 99 or more, so the next group is 00fff "
                "(for example 91099 00135).",
                "warning",
            )
        if not _supplementary_group(token):
            c.add(
                field,
                "invalid_supplementary",
                f"{token}: supplementary groups are 9SpSpspsp, five digits "
                "starting with 9.",
            )
            continue
        code, value = token[1:3], token[3:]
        if code in seen and code in NON_REPEATING_SUPPLEMENTARY:
            c.add(
                field,
                "duplicate_supplementary",
                f"{token}: 9{code} appears more than once.",
                "warning",
            )
        seen.add(code)
        if code in WIND_SPEED_GROUPS and value[:2] == "99":
            wide_after = token
        if code in SUPPLEMENTARY_GUST_CODES:
            if c.present("wind_gust"):
                c.add(
                    field,
                    "duplicate_gust",
                    "The gust is keyed in the wind gust field and again as "
                    f"{SUPPLEMENTARY_GUST_CODES[code]}.",
                    "warning",
                )
            if speed is not None and int(value) < speed:
                c.add(
                    field,
                    "gust_below_mean",
                    f"{token}: gust speed is normally not below the mean wind speed.",
                    "warning",
                )
        elif code == SUPPLEMENTARY_WEATHER_CODE:
            continue
        elif code in TIME_GROUPS_FOR_WW:
            if not c.present("present_wx"):
                c.add(
                    field,
                    "time_group_without_weather",
                    f"{token}: 9{code}tt gives the time of the weather reported by ww, "
                    "but ww is empty.",
                    "warning",
                )
        elif code in TIME_GROUPS_FOR_NEXT:
            following = tokens[index + 1] if index + 1 < len(tokens) else ""
            if not _supplementary_group(following):
                c.add(
                    field,
                    "time_group_without_target",
                    f"{token}: 9{code}tt describes the 9-group that follows it, "
                    "but none follows.",
                    "warning",
                )
        elif code == TIME_GROUP_FOR_PREVIOUS:
            before = tokens[index - 1] if index else ""
            if not _supplementary_group(before):
                c.add(
                    field,
                    "time_group_without_target",
                    f"{token}: 903tt gives the time the phenomenon in the preceding "
                    "9-group ended, but none precedes it.",
                    "warning",
                )
        elif code == SUPPLEMENTARY_NOT_USED:
            # Not confirmed against WMO-No. 306 Vol. I.1 (not on file): advice only.
            c.add(
                field,
                "unused_supplementary",
                f"{token}: group 908 is reported as not used (unconfirmed); check it.",
                "warning",
            )
        elif code == SUPPLEMENTARY_PRECIPITATION:
            _check_precipitation_timing(c, field, token)
        elif code == SUPPLEMENTARY_DIRECTION:
            direction = int(value)
            if direction > WIND_DIRECTION_MAX_TENS and direction != WIND_VARIABLE:
                c.add(
                    field,
                    "out_of_range",
                    f"{token}: wind direction dd is 00 to 36 (tens of degrees), 99 variable.",
                )
        elif code not in WIND_SPEED_GROUPS and code not in (
            "16",
            "17",
        ):
            c.add(
                field,
                "unchecked_supplementary",
                f"{token}: 9{code}.. is passed through without checking.",
                "warning",
            )
    if wide_after is not None:
        c.add(
            field,
            "speed_needs_fff",
            f"{wide_after}: ff 99 means 99 or more, so the next group is 00fff "
            "(for example 91099 00135).",
            "warning",
        )
    maximum = _supplementary_speed(tokens, SUPPLEMENTARY_MAX_MEAN)
    minimum = _supplementary_speed(tokens, SUPPLEMENTARY_MIN_MEAN)
    if maximum is not None and minimum is not None and maximum < minimum:
        c.add(
            field,
            "mean_wind_order",
            "The highest mean wind (912ff) is below the lowest mean wind (914ff).",
            "warning",
        )


def _supplementary_speed(tokens: list[str], code: str) -> int | None:
    """ff of the first 9<code>ff group, or the three digits of its 00fff group."""
    for index, token in enumerate(tokens):
        if _supplementary_group(token) and token[1:3] == code:
            ff = int(token[3:])
            if ff == WIND_FFF_MIN:
                after = tokens[index + 1] if index + 1 < len(tokens) else ""
                if after.isdigit() and after.startswith(WIDE_SPEED_PREFIX):
                    return int(after[2:])
            return ff
    return None


def _check_pressure_and_weather(
    c: _Checker, hour: int | None
) -> tuple[float | None, float | None]:
    # Station pressure may be well below sea level pressure at elevated sites.
    station = c.pressure("station_pressure", "Station pressure", 500, 1085.7)
    sea_level = c.pressure("msl_pressure", "MSL pressure")
    if sea_level is not None and station is None:
        c.add(
            "station_pressure",
            "missing_station_pressure",
            "Station pressure is reported with mean sea level pressure (B/C1.3.1.1).",
            "warning",
        )
    tendency = c.integer("pressure_tendency", "Pressure tendency a", 0, 8, width=1)
    change = c.raw("pressure_change")
    amount: int | None = None
    if c.present("pressure_change"):
        if not change.isdigit() or len(change) != THREE_DIGIT_GROUP:
            c.add(
                "pressure_change",
                "invalid_format",
                "Pressure change ppp must be three digits in tenths of hPa.",
            )
        else:
            amount = int(change)
    _check_tendency(c, tendency, amount)
    if (
        hour in PRESSURE_CHANGE_HOURS
        and not c.present("pressure_tendency")
        and not c.present("pressure_change")
    ):
        c.add(
            "pressure_tendency",
            "missing_pressure_change",
            "The pressure tendency group 5appp is reported every 3 hours "
            "(00, 03, 06 ... 21 UTC).",
            "warning",
        )
    ww = c.integer("present_wx", "Present weather ww", 0, 99, width=2)
    w1 = c.integer("past_wx_1", "Past weather W1", 0, 9, width=1)
    w2 = c.integer("past_wx_2", "Past weather W2", 0, 9, width=1)
    if w1 is not None and w2 is not None and w1 < w2:
        c.add(
            "past_wx_1",
            "past_weather_order",
            "W1 carries the higher code figure (more significant weather); "
            "W2 the lower (B/C1.4.6).",
            "warning",
        )
    _check_weather_indicator(c, ww, w1, w2)
    return station, sea_level


def _check_tendency(c: _Checker, tendency: int | None, amount: int | None) -> None:
    """Code table 0200: a states the characteristic, ppp the 3 h change (tenths hPa)."""
    if tendency is None or amount is None:
        if (tendency is None) != (amount is None) and (
            c.present("pressure_tendency") or c.present("pressure_change")
        ):
            c.add(
                "pressure_change" if tendency is not None else "pressure_tendency",
                "missing_group",
                "Group 5appp needs both the tendency a and the change ppp.",
                "warning",
            )
        return
    if tendency == STEADY_TENDENCY and amount != 0:
        c.add(
            "pressure_change",
            "tendency_mismatch",
            "Tendency 4 (steady) means the 3 h change ppp is 000.",
        )
    elif tendency in CHANGING_TENDENCY and amount == 0:
        c.add(
            "pressure_change",
            "tendency_mismatch",
            f"Tendency {tendency} means pressure is now "
            + ("higher" if tendency < STEADY_TENDENCY else "lower")
            + " than 3 h ago; ppp cannot be 000.",
        )


def _check_weather_indicator(
    c: _Checker, ww: int | None, w1: int | None, w2: int | None
) -> None:
    """Code table 1860 ix: groups 7wwW1W2 included (1, 4, 7) or omitted (2, 3, 5, 6)."""
    ix = c.raw("station_wx_indicator")
    reported = any(v is not None for v in (ww, w1, w2))
    if ix in ("2", "3", "5", "6") and reported:
        c.add(
            "present_wx",
            "indicator_conflict",
            f"ix={ix} means group 7wwW1W2 is omitted; clear it or set ix to 1, 4 or 7 "
            "(Code table 1860).",
        )
    elif ix in ("1", "4", "7") and not reported:
        c.add(
            "present_wx",
            "missing_group",
            f"ix={ix} means group 7wwW1W2 is included.",
            "warning",
        )


def _decode_dew_point(
    c: _Checker, air: float | None
) -> tuple[float | None, int | None]:
    """Group 2: dew point snTTT, or sign 9 for relative humidity (2 9UUU).

    A station that reports humidity instead of a dew point keys 9UUU (Code table 3845
    sign 9). The humidity is returned as it is, and the dew point is calculated from it
    and the air temperature, so the report still validates and decodes.
    """
    value = c.raw("dew_point")
    if not (
        c.present("dew_point")
        and value.isdigit()
        and len(value) == FOUR_DIGIT_GROUP
        and value[0] == HUMIDITY_SIGN
    ):
        return c.signed_tenths("dew_point", "Dew point"), None
    percent = int(value[1:])
    if percent > MAX_PERCENT:
        c.add(
            "dew_point",
            "out_of_range",
            "Relative humidity in group 2 (sign 9) must be 0 to 100 per cent.",
        )
        return None, None
    if air is None or percent == 0:
        return None, percent
    vapour = derive.saturation_vapour_pressure_hpa(air) * percent / MAX_PERCENT
    return round(min(derive.dew_point_from_vapour_pressure(vapour), air), 1), percent


def _check_fog_visibility(c: _Checker, visibility_code: int | None) -> None:
    """Present weather against the visibility (WMO-No. 306 Vol I.1, 12.2.6.4)."""
    ww = _to_int(c.raw("present_wx"))
    if visibility_code is None or ww is None:
        return
    metres = _visibility_metres(visibility_code)
    if ww in FOG_AT_STATION and metres >= FOG_VISIBILITY_M:
        c.add(
            "present_wx",
            "fog_visibility",
            f"ww={ww:02d} is fog at the station; visibility must be below 1000 m "
            "(VV 00 to 09 or 90 to 93), 12.2.6.4.13.",
            "warning",
        )
    elif ww == MIST_WW and metres < FOG_VISIBILITY_M:
        c.add(
            "present_wx",
            "mist_visibility",
            "ww=10 (mist) needs a visibility of 1000 m or more; below that, "
            "report fog (12.2.6.4.6).",
            "warning",
        )


def _precipitation_hours(c: _Checker) -> int | None:
    return PRECIPITATION_PERIOD_HOURS.get(_to_int(c.raw("precip_period")) or 0)


def _past_weather_hours(hour: int | None) -> int | None:
    """Hours covered by W1 and W2 (12.2.6.6.1): 6 at main hours, 3 at 03, 09, 15, 21."""
    if hour is None:
        return None
    if hour in MAIN_HOURS:
        return 6
    return 3 if hour in THREE_HOURLY_REPORTS else 1


def _check_weather_links(
    c: _Checker, total: int | None, hour: int | None, precipitation: float | None
) -> None:
    """Links between ww, W1W2, cloud and rain that keying slips break (12.2.6.4, 12.2.6.6)."""
    ww = _to_int(c.raw("present_wx"))
    w1 = _to_int(c.raw("past_wx_1"))
    w2 = _to_int(c.raw("past_wx_2"))
    if ww is not None and ww in PRECIPITATION_WW and total == 0:
        c.add(
            "present_wx",
            "precipitation_without_cloud",
            f"ww={ww:02d} is precipitation or thunderstorm but total cloud N is 0 "
            "(clear sky).",
            "warning",
        )
    layer_forms = {_to_int(c.raw(f"s3_layer{n}_form")) for n in LAYERS}
    cloud_low = _to_int(c.raw("low_cloud_type"))
    if (
        ww in THUNDERSTORM_WW
        and cloud_low is not None
        and cloud_low not in CUMULONIMBUS_CL
        and CUMULONIMBUS not in layer_forms
    ):
        c.add(
            "present_wx",
            "thunderstorm_without_cb",
            f"ww={ww:02d} is a thunderstorm but no cumulonimbus is reported "
            "(CL 3 or 9, or a layer of type 9).",
            "warning",
        )
    shown = (ww in RECENT_PRECIPITATION_WW) or any(
        w in PRECIPITATION_PAST_WEATHER for w in (w1, w2) if w is not None
    )
    covered = _past_weather_hours(hour)
    period = _precipitation_hours(c)
    if (
        precipitation is not None
        and precipitation > 0
        and not shown
        and covered is not None
        and period is not None
        and period <= covered
    ):
        c.add(
            "present_wx",
            "rain_without_weather",
            "Rain is recorded in the last "
            f"{period} h (6RRRtR) but ww and W1W2 show no precipitation; check them.",
            "warning",
        )
    if w1 is not None and w2 is None and c.present("past_wx_1"):
        c.add(
            "past_wx_2",
            "past_weather_second_missing",
            "W2 is empty: when only one past-weather type occurred, the same figure is "
            "reported in both W1 and W2 (12.2.6.6.5).",
            "warning",
        )


def validate_synop(
    workbook: SynopWorkbook,
    amounts: derive.PressureSettings | None = None,
    history: Mapping[int, SynopWorkbook] | None = None,
    limits: hourly.HourlyLimits | None = None,
) -> tuple[list[SynopValidationIssue], SynopDecoded]:
    """Check a workbook and decode it to SI values.

    ``history`` maps hours-before (1 and 3) to the saved observation of that hour; when
    given, the hour-to-hour warnings of ``hourly`` are added (``limits`` overrides the
    defaults). They never make the workbook invalid.

    Pressure groups 3 and 4 (from the barometer as read and the station's
    ``amounts``), visibility in kilometres, dew point, vapour pressure and relative
    humidity are calculated first (``derive``), so everything below sees the
    coded values. A keyed group 3 or 4 that differs from the rule warns.
    """
    workbook = derive.apply_to_workbook(workbook, amounts)
    c = _Checker(workbook)
    _, hour = _check_identification(c)
    direction, speed, gust = _check_wind(c)
    air = c.signed_tenths("air_temp", "Air temperature")
    dew, humidity_group = _decode_dew_point(c, air)
    wet = c.signed_tenths("wet_bulb", "Wet bulb")
    if air is not None and dew is not None and dew > air:
        c.add("dew_point", "dew_above_air", "Dew point cannot exceed air temperature.")
    if wet is not None and air is not None and wet > air:
        c.add(
            "wet_bulb",
            "wet_above_air",
            "Wet bulb temperature is normally not above the air temperature.",
            "warning",
        )
    if wet is not None and dew is not None and dew > wet:
        c.add(
            "dew_point",
            "dew_above_wet",
            "Dew point is normally not above the wet bulb temperature.",
            "warning",
        )
    humidity = c.percent("relative_humidity", "Relative humidity")
    if humidity is None:
        humidity = humidity_group
    _check_visibility_km(c)
    visibility_code = c.integer("visibility", "Visibility VV", 0, 99, width=2)
    if visibility_code in UNUSED_VISIBILITY_CODES:
        c.add("visibility", "unused_code", "Visibility codes 51 to 55 are not used.")
        visibility_code = None
    total = _check_clouds(c)
    _check_fog_visibility(c, visibility_code)
    _check_layers(c, total)
    station, sea_level = _check_pressure_and_weather(c, hour)
    precipitation, rainfall_24h = _check_precipitation(c, hour)
    _check_weather_links(c, total, hour, precipitation)
    tmax, tmin, change_24h = _check_section3(c, hour, air)
    _check_supplementary(c, _to_int(c.raw("wind_speed")))
    _check_group_909(c)
    _check_barometer_reading(c)
    for field, code, message in derive.pressure_mismatches(
        workbook.model_dump(), amounts
    ):
        c.add(field, code, message, "warning")
    found = derive.pressures(workbook.model_dump(), amounts)

    is_nil = all(
        not c.present(field)
        for field in SynopWorkbook.model_fields
        if field not in NOT_DATA
    )
    if is_nil:
        # Every value is missing by definition: drop advice about absent data.
        c.issues = [issue for issue in c.issues if issue.severity == "error"]
        c.add(
            "report_type",
            "nil_report",
            "No observation values entered: this is reported as a NIL report (B/C general (ix)).",
            "warning",
        )

    def kelvin(value: float | None) -> float | None:
        return None if value is None else round(value + KELVIN, 2)

    def pascals(value: float | None) -> float | None:
        return None if value is None else round(value * 100)

    cloud_percent = None
    if total is not None:
        cloud_percent = 113 if total == OBSCURED else int(total * 12.5 + 0.5)
    decoded = SynopDecoded(
        international_data_subcategory=_subcategory(hour),
        is_nil_report=is_nil,
        air_temperature_k=kelvin(air),
        wet_bulb_k=kelvin(wet),
        dew_point_k=kelvin(dew),
        max_temperature_k=kelvin(tmax),
        min_temperature_k=kelvin(tmin),
        station_pressure_pa=pascals(station),
        mean_sea_level_pressure_pa=pascals(sea_level),
        wind_direction_deg=direction,
        wind_speed_ms=speed,
        wind_gust_ms=gust,
        relative_humidity_percent=humidity,
        visibility_m=(
            None if visibility_code is None else _visibility_metres(visibility_code)
        ),
        total_cloud_percent=cloud_percent,
        precipitation_kg_m2=precipitation,
        rainfall_24h_kg_m2=rainfall_24h,
        pressure_change_24h_pa=change_24h,
        sunshine_24h_hours=_tenths_or_none(c.raw("s3_sunshine_24h")),
        ground_state=_to_int(c.raw("s3_ground_state")),
        qfe_pa=None if found.qfe_hpa is None else float(found.qfe_hpa * 100),
        qnh_pa=None if found.qnh_hpa is None else float(found.qnh_hpa * 100),
    )
    if history and not is_nil:
        past = {
            hours: validate_synop(old, amounts)[1] for hours, old in history.items()
        }
        c.issues.extend(
            hourly.check(
                workbook,
                decoded,
                past,
                limits or hourly.DEFAULT_LIMITS,
                history.get(1),
            )
        )
    if not is_nil:
        c.issues.extend(metar.compare(workbook, decoded))
    return c.issues, decoded


def check_observation_time(
    workbook: SynopWorkbook, observed_at: datetime
) -> list[SynopValidationIssue]:
    """The keyed YYGG must be the UTC day and hour of the observation time.

    Errors, because a report whose group says one hour and whose record says
    another would be published under the wrong time. Blank or malformed entries
    are left to ``validate_synop``.
    """
    moment = observed_at.astimezone(UTC)
    issues: list[SynopValidationIssue] = []
    for field, label, expected in (
        ("day", "Day", moment.day),
        ("time_utc", "UTC hour", moment.hour),
    ):
        value = (getattr(workbook, field) or "").strip()
        if value.isdigit() and int(value) != expected:
            issues.append(
                SynopValidationIssue(
                    field=field,
                    code="time_mismatch",
                    message=(
                        f"{label} {value} does not match the observation time "
                        f"{moment:%Y-%m-%d %H:%M} UTC ({expected:02d})."
                    ),
                    severity="error",
                )
            )
    return issues
