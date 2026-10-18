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

from collections.abc import Collection
from typing import Literal

from .schemas import SynopDecoded, SynopValidationIssue, SynopWorkbook

Severity = Literal["error", "warning"]

KNOT_MS = 0.514444
KELVIN = 273.15
IDENTIFICATION = ("report_type", "day", "time_utc", "station_id", "wind_indicator")
NOT_DATA = (*IDENTIFICATION, "s3_remarks", "notes", "observer_initials")
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
CHANGING_TENDENCY = (1, 2, 3, 6, 7)
FOG_AT_STATION = range(41, 50)
FOG_VISIBILITY_M = 1000
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
    if hour is not None and hour % 3:
        c.add(
            "time_utc",
            "non_synoptic_hour",
            "SYNOP is made at the standard hours 00, 03, 06, 09, 12, 15, 18 and 21 UTC.",
            "warning",
        )
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
    elif rain == "" and hour == SYNOP_NOON_HOUR:
        c.add(
            "s3_rainfall_24h",
            "missing_24h_rainfall",
            "24 h rainfall is expected at the 12 UTC main hour (B/C1.4.3.2.1).",
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


def _check_section3(c: _Checker) -> tuple[float | None, float | None]:
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
    change = c.raw("s3_baro_change_24h")
    if c.present("s3_baro_change_24h") and (
        not change.isdigit() or len(change) != FOUR_DIGIT_GROUP
    ):
        c.add(
            "s3_baro_change_24h",
            "invalid_format",
            "24 h pressure change must be four digits: sign j1 (0 or 1) then P24P24P24 in tenths.",
        )
    elif c.present("s3_baro_change_24h") and change[0] not in "01":
        c.add(
            "s3_baro_change_24h",
            "invalid_sign",
            "24 h pressure change sign j1 is 0 or 1.",
            "warning",
        )
    return tmax, tmin


def _check_pressure_and_weather(c: _Checker) -> tuple[float | None, float | None]:
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


def _check_fog_visibility(c: _Checker, visibility_code: int | None) -> None:
    """ww 41-49 (fog at the station) goes with visibility below 1000 m (Code table 4677)."""
    ww = c.raw("present_wx")
    if (
        visibility_code is not None
        and ww.isdigit()
        and int(ww) in FOG_AT_STATION
        and _visibility_metres(visibility_code) >= FOG_VISIBILITY_M
    ):
        c.add(
            "present_wx",
            "fog_visibility",
            f"ww={ww} is fog at the station; visibility is normally below 1000 m "
            "(VV 00 to 10 or 90 to 94).",
            "warning",
        )


def validate_synop(
    workbook: SynopWorkbook,
) -> tuple[list[SynopValidationIssue], SynopDecoded]:
    """Check a workbook and decode it to SI values."""
    c = _Checker(workbook)
    _, hour = _check_identification(c)
    direction, speed, gust = _check_wind(c)
    air = c.signed_tenths("air_temp", "Air temperature")
    dew = c.signed_tenths("dew_point", "Dew point")
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
    visibility_code = c.integer("visibility", "Visibility VV", 0, 99, width=2)
    if visibility_code in UNUSED_VISIBILITY_CODES:
        c.add("visibility", "unused_code", "Visibility codes 51 to 55 are not used.")
        visibility_code = None
    total = _check_clouds(c)
    _check_fog_visibility(c, visibility_code)
    _check_layers(c, total)
    station, sea_level = _check_pressure_and_weather(c)
    precipitation, rainfall_24h = _check_precipitation(c, hour)
    tmax, tmin = _check_section3(c)

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
    )
    return c.issues, decoded
