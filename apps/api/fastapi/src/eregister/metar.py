"""The METAR an observation implies, and a check of a typed METAR against it.

One entry gives two reports at the top of the register: the SYNOP and the METAR. The
register builds the METAR from the coded groups (this module), the observer may edit
it, and any element that disagrees with the observation is a warning.

Rounding follows ICAO Annex 3 Appendix 3, as carried in WMO-No. 49 Vol. II (2018,
updated 2021), which is the edition on file. Annex 3 Amendment 82 (applicable from
27 November 2025) is not on file: re-check these steps against it.

- 4.1.5.1  wind direction to 10 degrees and speed to 1 kt, rounded to the nearest step
- 4.1.5.2  gusts reported at 10 kt or more above the mean; under 1 kt is calm
- 4.2.4.1  visibility in 50 m steps under 800 m, 100 m steps to 5 km, 1 km steps to
           10 km, 9999 from 10 km, rounded down
- 4.5.4    cloud base in 100 ft steps to 10 000 ft, rounded down; FEW 1-2, SCT 3-4,
           BKN 5-7, OVC 8 oktas; layers by the criteria of 4.5.4.3 (e)
- 4.6.2.1  temperature and dew point to the nearest whole degree, 0.5 rounded up
- 4.7.3.1  QNH in whole hPa, rounded down

All functions are pure. A SYNOP code stands for a range (it was itself rounded down), so
the expected values are sets of everything the observation allows, and ``text`` shows
one natural choice for the observer to copy.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from math import floor

from .schemas import SynopDecoded, SynopValidationIssue, SynopWorkbook

ICAO = "TGPY"
FIELD = "metar_text"
KNOTS_PER_MS = 1.943_84
FEET_PER_METRE = 3.280_84
METRES_PER_HUNDRED_FEET = 30.48
OPERATIONAL_CLOUD_M = 1500.0  # 5000 ft; GMS may use the higher minimum sector altitude
CLOUD_STEP_LIMIT_M = 3000.0  # 100 ft steps are defined up to 10 000 ft
GUST_EXCESS_KT = 10
CALM_BELOW_KT = 1
OBSCURED = 9
CUMULONIMBUS = 9
VISIBILITY_TEN_KM = 10_000
VISIBILITY_METAR_TOP = 9999
VISIBILITY_FINE_LIMIT = 800
VISIBILITY_MEDIUM_LIMIT = 5000
WIND_NO_DIRECTION = 99
SAFE_FLOAT_MARGIN = 1e-9
# Code table 4377 for VV 90 to 99 (metres, lower bound of each class).
_COARSE_VISIBILITY = (0, 50, 200, 500, 1000, 2000, 4000, 10000, 20000, 50000)
VISIBILITY_COARSE_FIRST = 90
VISIBILITY_FINE_LAST = 50
VISIBILITY_KM_FIRST = 56
VISIBILITY_KM_30 = 80
AMOUNT_WORDS = (("FEW", 1, 2), ("SCT", 3, 4), ("BKN", 5, 7), ("OVC", 8, 8))
CLEAR_WORDS = frozenset({"NSC", "SKC", "NCD", "CLR"})

_WIND = re.compile(r"^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?KT$")
_VISIBILITY = re.compile(r"^\d{4}$")
_LAYER = re.compile(r"^(FEW|SCT|BKN|OVC)(\d{3}|///)(CB|TCU)?$")
_VERTICAL = re.compile(r"^VV(\d{3}|///)$")
_TEMPERATURE = re.compile(r"^(M?\d{2})/(M?\d{2}|//)?$")
_QNH = re.compile(r"^Q(\d{4})$")
_LAYER_TOKEN = re.compile(r"^(FEW|SCT|BKN|OVC)\d{3}")


@dataclass(frozen=True)
class Layer:
    word: str
    allowed: tuple[int, ...]  # hundreds of feet the observation allows
    shown: int
    cumulonimbus: bool


@dataclass(frozen=True)
class Expected:
    wind: str | None
    wind_direction: int | None
    wind_variable: bool
    wind_knots: int | None
    wind_tolerance: int
    gust: int | None
    visibility: tuple[int, ...] | None
    clear_sky: bool
    layers: tuple[Layer, ...]
    obscured: tuple[int, ...] | None
    temperature: frozenset[str] | None
    dew_point: frozenset[str] | None
    qnh: int | None


def _digits(value: str | None, width: int) -> int | None:
    text = (value or "").strip()
    return int(text) if text.isdigit() and len(text) == width else None


def _scale_value(metres: float) -> int:
    """A visibility rounded down onto the METAR scale."""
    if metres >= VISIBILITY_TEN_KM:
        return VISIBILITY_METAR_TOP
    if metres < VISIBILITY_FINE_LIMIT:
        return int(metres // 50 * 50)
    if metres < VISIBILITY_MEDIUM_LIMIT:
        return int(metres // 100 * 100)
    return int(metres // 1000 * 1000)


def visibility_range_m(code: int) -> tuple[float, float] | None:
    """Metres a visibility code VV stands for, as [low, high); None for unused codes."""
    if code >= VISIBILITY_COARSE_FIRST:
        index = code - VISIBILITY_COARSE_FIRST
        high = (
            _COARSE_VISIBILITY[index + 1]
            if index + 1 < len(_COARSE_VISIBILITY)
            else float("inf")
        )
        return float(_COARSE_VISIBILITY[index]), float(high)
    if code <= VISIBILITY_FINE_LAST:
        return code * 100.0, code * 100.0 + 100.0
    if code < VISIBILITY_KM_FIRST:
        return None
    low = (code - 50) * 1000.0
    return (low, low + 1000.0) if code < VISIBILITY_KM_30 else (low, float("inf"))


def visibility_values(code: int) -> tuple[int, ...] | None:
    """Every METAR visibility the code allows, lowest first."""
    span = visibility_range_m(code)
    if span is None:
        return None
    low, high = span
    values = {_scale_value(low)}
    step = (
        50
        if low < VISIBILITY_FINE_LIMIT
        else 100
        if low < VISIBILITY_MEDIUM_LIMIT
        else 1000
    )
    metres = low
    while metres < min(high, VISIBILITY_TEN_KM + 1):
        values.add(_scale_value(metres))
        metres += step
    return tuple(sorted(values))


def _height_metres(code: int) -> tuple[float, float] | None:
    """Metres a cloud height code stands for (Code table 1677), up to 3000 m."""
    if code == 0:
        return 0.0, 30.0
    if 1 <= code <= 50:
        return code * 30.0, code * 30.0 + 30.0
    if 56 <= code <= 60:  # 300 m steps up to 3000 m
        low = (code - 50) * 300.0
        return low, low + 300.0
    return None


def cloud_hundreds(code: int) -> tuple[tuple[int, ...], int] | None:
    """Hundreds of feet a METAR may give for a height code, and the natural choice."""
    span = _height_metres(code)
    if span is None:
        return None
    low, high = span
    lowest = floor(low * FEET_PER_METRE / 100 + SAFE_FLOAT_MARGIN)
    highest = floor(high * FEET_PER_METRE / 100 - SAFE_FLOAT_MARGIN)
    allowed = tuple(range(lowest, highest + 1))
    # The step whose 100 ft (30.48 m) lies inside the range: 600 m is 020, not 019.
    shown = -(-int(low * 100) // int(METRES_PER_HUNDRED_FEET * 100))
    return allowed, shown if shown in allowed else allowed[-1]


def _round_half_up(value: float) -> int:
    return floor(value + 0.5)


def _temperature_tokens(tenths: str | None) -> frozenset[str] | None:
    group = (tenths or "").strip()
    if not group.isdigit() or len(group) not in (3, 4):
        return None
    negative = len(group) == 4 and group[0] == "1"
    degrees = (-1 if negative else 1) * int(group[-3:]) / 10
    rounded = _round_half_up(degrees)
    if rounded == 0:
        # Observed below zero but rounded to zero is identified as negative (4.6.2.2).
        return frozenset({"00", "M00"}) if degrees < 0 else frozenset({"00"})
    return frozenset({f"M{abs(rounded):02d}" if rounded < 0 else f"{rounded:02d}"})


def _wind(
    workbook: SynopWorkbook,
) -> tuple[str | None, int | None, bool, int | None, int, int | None]:
    direction = _digits(workbook.wind_dir, 2)
    raw = (workbook.wind_speed or "").strip()
    speed = int(raw) if raw.isdigit() and len(raw) in (2, 3) else None
    if direction is None or speed is None:
        return None, None, False, None, 0, None
    metres = (workbook.wind_indicator or "").strip() in ("0", "1")
    knots = _round_half_up(speed * KNOTS_PER_MS) if metres else speed
    tolerance = 1 if metres else 0
    gust: int | None = None
    gust_raw = (workbook.wind_gust or "").strip()
    if gust_raw.isdigit() and len(gust_raw) in (2, 3):
        gust_knots = (
            _round_half_up(int(gust_raw) * KNOTS_PER_MS) if metres else int(gust_raw)
        )
        gust = gust_knots if gust_knots - knots >= GUST_EXCESS_KT else None
    if knots < CALM_BELOW_KT:
        return "00000KT", 0, False, 0, 0, None
    if direction == WIND_NO_DIRECTION:
        return f"VRB{knots:02d}KT", None, True, knots, tolerance, gust
    group = f"{direction * 10:03d}{knots:02d}{f'G{gust:02d}' if gust else ''}KT"
    return group, direction * 10, False, knots, tolerance, gust


def _layers(
    workbook: SynopWorkbook,
) -> tuple[bool, tuple[Layer, ...], tuple[int, ...] | None]:
    """(clear sky, the layers a METAR reports, vertical visibility hundreds if obscured)."""
    total = _digits(workbook.total_cloud, 1)
    if total == 0:
        return True, (), None
    obscured: tuple[int, ...] | None = None
    layers: list[Layer] = []
    for n in (1, 2, 3, 4):
        amount = _digits(getattr(workbook, f"s3_layer{n}_amount"), 1)
        form = _digits(getattr(workbook, f"s3_layer{n}_form"), 1)
        code = _digits(getattr(workbook, f"s3_layer{n}_height"), 2)
        if amount is None:
            continue
        if amount == OBSCURED:
            hundreds = None if code is None else cloud_hundreds(code)
            obscured = hundreds[0] if hundreds else ()
            continue
        word = next((w for w, low, high in AMOUNT_WORDS if low <= amount <= high), None)
        if word is None or code is None:
            continue
        height = _height_metres(code)
        is_cb = form == CUMULONIMBUS
        if height is None:
            if is_cb:
                layers.append(Layer(word, (), 0, True))
            continue
        if height[0] > OPERATIONAL_CLOUD_M and not is_cb:
            continue  # not of operational significance
        allowed, shown = cloud_hundreds(code) or ((), 0)
        layers.append(Layer(word, allowed, shown, is_cb))
    return False, tuple(layers), obscured


def expected(workbook: SynopWorkbook, decoded: SynopDecoded) -> Expected:
    wind, direction, variable, knots, tolerance, gust = _wind(workbook)
    code = _digits(workbook.visibility, 2)
    clear, layers, obscured = _layers(workbook)
    qnh = None if decoded.qnh_pa is None else int(decoded.qnh_pa) // 100
    return Expected(
        wind=wind,
        wind_direction=direction,
        wind_variable=variable,
        wind_knots=knots,
        wind_tolerance=tolerance,
        gust=gust,
        visibility=None if code is None else visibility_values(code),
        clear_sky=clear,
        layers=layers,
        obscured=obscured,
        temperature=_temperature_tokens(workbook.air_temp),
        dew_point=_temperature_tokens(workbook.dew_point),
        qnh=qnh,
    )


def text(workbook: SynopWorkbook, decoded: SynopDecoded) -> str | None:
    """The METAR the observation implies, for the observer to copy and edit."""
    want = expected(workbook, decoded)
    day = (workbook.day or "").strip().rjust(2, "0")
    hour = (workbook.time_utc or "").strip().rjust(2, "0")
    if not (day.isdigit() and hour.isdigit() and want.wind):
        return None
    parts = [f"METAR {ICAO} {day}{hour}00Z", want.wind]
    parts.append(f"{want.visibility[0]:04d}" if want.visibility else "////")
    if want.obscured:
        parts.append(f"VV{want.obscured[-1]:03d}")
    elif want.clear_sky:
        parts.append("NSC")
    else:
        parts += [
            f"{layer.word}{layer.shown:03d}{'CB' if layer.cumulonimbus else ''}"
            for layer in want.layers
        ]
    temperature = min(want.temperature) if want.temperature else "//"
    dew = min(want.dew_point) if want.dew_point else "//"
    parts.append(f"{temperature}/{dew}")
    parts.append(f"Q{want.qnh:04d}=" if want.qnh is not None else "Q////=")
    return " ".join(parts)


def _warn(code: str, message: str) -> SynopValidationIssue:
    return SynopValidationIssue(
        field=FIELD, code=code, message=message, severity="warning"
    )


def _wind_issues(want: Expected, tokens: list[str]) -> list[SynopValidationIssue]:
    typed = next((m for t in tokens if (m := _WIND.match(t))), None)
    if want.wind is None:
        return []
    if typed is None:
        return [
            _warn(
                "metar_wind",
                f"The METAR has no wind group; the observation gives {want.wind}.",
            )
        ]
    direction, speed, gust = typed.group(1), int(typed.group(2)), typed.group(3)
    found: list[SynopValidationIssue] = []
    if (
        want.wind_knots is not None
        and abs(speed - want.wind_knots) > want.wind_tolerance
    ):
        found.append(
            _warn(
                "metar_wind",
                f"METAR wind speed {speed:02d} kt differs from the observation ({want.wind}).",
            )
        )
    if want.wind_variable != (direction == "VRB") and not (
        direction == "VRB" and (want.wind_knots or 0) < 3
    ):
        found.append(
            _warn(
                "metar_wind",
                f"METAR wind direction {direction} differs from the observation ({want.wind}).",
            )
        )
    elif (
        direction != "VRB"
        and want.wind_direction is not None
        and int(direction) != want.wind_direction
        and want.wind_knots
    ):
        found.append(
            _warn(
                "metar_wind",
                f"METAR wind direction {direction} differs from the observation ({want.wind}).",
            )
        )
    if (want.gust is None) != (gust is None) or (
        gust is not None
        and want.gust is not None
        and abs(int(gust) - want.gust) > want.wind_tolerance
    ):
        shown = f"G{want.gust:02d}" if want.gust else "no gust"
        found.append(
            _warn(
                "metar_gust",
                f"METAR gust {('G' + gust) if gust else 'none'} differs from the observation ({shown}; a gust is reported at 10 kt above the mean or more).",
            )
        )
    return found


def _visibility_issues(
    want: Expected, tokens: list[str], cavok: bool
) -> list[SynopValidationIssue]:
    if want.visibility is None:
        return []
    if cavok:
        unsupported = (
            want.visibility[0] < VISIBILITY_METAR_TOP
            or want.layers
            or want.obscured is not None
        )
        return (
            [
                _warn(
                    "metar_cavok",
                    "CAVOK needs visibility of 10 km or more and no cloud of operational significance; the observation does not support that.",
                )
            ]
            if unsupported
            else []
        )
    typed = next(
        (int(t) for t in tokens if _VISIBILITY.match(t) and not _WIND.match(t)), None
    )
    if typed is None:
        return [
            _warn(
                "metar_visibility",
                f"The METAR has no visibility; the observation gives {want.visibility[0]:04d}.",
            )
        ]
    if typed not in want.visibility:
        shown = "/".join(f"{v:04d}" for v in want.visibility[:3])
        return [
            _warn(
                "metar_visibility",
                f"METAR visibility {typed:04d} differs from the observation ({shown}; visibility is rounded down).",
            )
        ]
    return []


def _cloud_issues(
    want: Expected, tokens: list[str], cavok: bool
) -> list[SynopValidationIssue]:
    layers = [m for t in tokens if (m := _LAYER.match(t))]
    vertical = next((m for t in tokens if (m := _VERTICAL.match(t))), None)
    clear = any(t in CLEAR_WORDS for t in tokens)
    found: list[SynopValidationIssue] = []
    if cavok:
        return found
    if want.obscured is not None:
        if vertical is None:
            found.append(
                _warn(
                    "metar_cloud_missing",
                    "The sky is obscured: the METAR needs the vertical visibility group (VVhhh).",
                )
            )
        return found
    if want.clear_sky:
        if layers or vertical is not None:
            found.append(
                _warn(
                    "metar_cloud_extra",
                    "The observation has a clear sky (N=0) but the METAR reports cloud.",
                )
            )
        return found
    remaining = list(layers)
    for layer in want.layers:
        match = next(
            (
                m
                for m in remaining
                if m.group(1) == layer.word
                and (
                    m.group(2) == "///"
                    or int(m.group(2)) in layer.allowed
                    or not layer.allowed
                )
                and ((m.group(3) == "CB") == layer.cumulonimbus)
            ),
            None,
        )
        if match is None:
            shown = f"{layer.word}{layer.shown:03d}{'CB' if layer.cumulonimbus else ''}"
            found.append(
                _warn(
                    "metar_cloud_missing",
                    f"The observation has {shown} but the METAR has no matching layer.",
                )
            )
        else:
            remaining.remove(match)
    for extra in remaining:
        found.append(
            _warn(
                "metar_cloud_extra",
                f"METAR layer {extra.group(0)} is not in the observation.",
            )
        )
    if not want.layers and not layers and not clear and want.clear_sky is False:
        return found
    return found


def _temperature_issues(
    want: Expected, tokens: list[str]
) -> list[SynopValidationIssue]:
    typed = next((m for t in tokens if (m := _TEMPERATURE.match(t))), None)
    if want.temperature is None:
        return []
    if typed is None:
        return [
            _warn(
                "metar_temperature", "The METAR has no temperature and dew point group."
            )
        ]
    found: list[SynopValidationIssue] = []
    if typed.group(1) not in want.temperature:
        shown = "/".join(sorted(want.temperature))
        found.append(
            _warn(
                "metar_temperature",
                f"METAR temperature {typed.group(1)} differs from the observation ({shown}; 0.5 rounds up).",
            )
        )
    if (
        want.dew_point is not None
        and typed.group(2) not in (None, "//")
        and typed.group(2) not in want.dew_point
    ):
        shown = "/".join(sorted(want.dew_point))
        found.append(
            _warn(
                "metar_dew_point",
                f"METAR dew point {typed.group(2)} differs from the observation ({shown}).",
            )
        )
    return found


def _pressure_issues(want: Expected, tokens: list[str]) -> list[SynopValidationIssue]:
    typed = next((m for t in tokens if (m := _QNH.match(t))), None)
    if want.qnh is None:
        return []
    if typed is None:
        return [
            _warn(
                "metar_qnh",
                f"The METAR has no QNH; the observation gives Q{want.qnh:04d}.",
            )
        ]
    if int(typed.group(1)) != want.qnh:
        return [
            _warn(
                "metar_qnh",
                f"METAR QNH Q{typed.group(1)} differs from the observation (Q{want.qnh:04d}; QNH is rounded down to a whole hPa).",
            )
        ]
    return []


def compare(
    workbook: SynopWorkbook, decoded: SynopDecoded
) -> list[SynopValidationIssue]:
    """Warnings for every element of the typed METAR that disagrees with the observation."""
    typed_text = (workbook.metar_text or "").strip().upper()
    if not typed_text:
        return []
    tokens = [t for t in re.split(r"[\s=]+", typed_text) if t]
    want = expected(workbook, decoded)
    cavok = "CAVOK" in tokens
    return [
        *_wind_issues(want, tokens),
        *_visibility_issues(want, tokens, cavok),
        *_cloud_issues(want, tokens, cavok),
        *_temperature_issues(want, tokens),
        *_pressure_issues(want, tokens),
    ]
