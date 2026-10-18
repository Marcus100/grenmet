"""Coding rules for METAR, SPECI and TAF text (pure functions; no I/O).

Sources: WMO-No. 306 Manual on Codes Vol. I.1 (FM 15 METAR, FM 16 SPECI,
FM 51 TAF), ICAO Annex 3 / WMO-No. 49 Vol. II Appendix 3 (METAR/SPECI) and
Appendix 5 (TAF). `error` marks a code violation the message cannot carry to
a receiving decoder; `warning` marks reporting practice. Drafts stay savable:
the composer shows these findings, it does not block saving.

A single message cannot prove a SPECI was warranted (that needs the previous
report), so SPECI only gets a plausibility warning.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from .schemas import AviationIssue

Kind = Literal["METAR", "SPECI", "TAF"]

MIN_TAF_HOURS = 6
MAX_TAF_HOURS = 30
MAX_CHANGE_HOURS = 4
MAX_TREND_MINUTES = 120
MAX_CLOUD_LAYERS = 4
MAX_WEATHER_GROUPS = 3

# --- token grammar -----------------------------------------------------------

ICAO = re.compile(r"^[A-Z]{4}$")
TIME_Z = re.compile(r"^(\d{2})(\d{2})(\d{2})Z$")
WIND = re.compile(r"^(\d{3}|VRB|///)(\d{2,3}|//)(?:G(\d{2,3}))?(KT|MPS)$")
WIND_VARIATION = re.compile(r"^(\d{3})V(\d{3})$")
VISIBILITY = re.compile(r"^(\d{4}|////)(N|NE|E|SE|S|SW|W|NW|NDV)?$")
RVR = re.compile(r"^R(\d{2})([LCR])?/([MP])?(\d{4})(?:V([MP])?(\d{4}))?([UDN])?$")
CLOUD = re.compile(r"^(FEW|SCT|BKN|OVC)(\d{3}|///)(CB|TCU|///)?$")
VERTICAL_VIS = re.compile(r"^VV(\d{3}|///)$")
SKY_STATES = ("NSC", "NCD", "SKC", "CLR", "//////")
TEMPERATURE = re.compile(r"^(M?\d{2})/(M?\d{2})?$")
QNH = re.compile(r"^(Q)(\d{4})$|^(A)(\d{4})$")
PRECIP = "DZ|RA|SN|SG|PL|GR|GS|UP"
WEATHER = re.compile(
    rf"^(?P<int>[-+]|VC)?(?P<desc>MI|BC|PR|DR|BL|SH|TS|FZ)?"
    rf"(?P<ph>(?:{PRECIP})+|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)?$"
)
RECENT = re.compile(
    r"^RE(?:FZ(?:DZ|RA)|SH(?:RA|SN|GR|GS|PL|SG)|TS(?:RA|SN|GR|GS|PL|SG)?|"
    r"DZ|RA|SN|SG|PL|GR|GS|UP|BLSN|BLDU|BLSA|SS|DS|FC|VA)$"
)
WINDSHEAR = re.compile(r"^WS$|^RWY\d{2}[LCR]?$|^ALL$")
TREND_TIME = re.compile(r"^(FM|TL|AT)(\d{2})(\d{2})$")
TAF_PERIOD = re.compile(r"^(\d{2})(\d{2})/(\d{2})(\d{2})$")
TAF_FM = re.compile(r"^FM(\d{2})(\d{2})(\d{2})$")
TAF_TEMP = re.compile(r"^(TX|TN)(M?\d{2})/(\d{2})(\d{2})Z$")
PROB = re.compile(r"^PROB(30|40)$")
CAVOK = "CAVOK"
SIGNIFICANT_PHENOMENA = ("TS", "FZ", "SQ", "FC", "GR", "GS", "DS", "SS")
CAVOK_VIS_M = 9999
CAVOK_CEILING_FT = 5000
VISIBILITY_FOG_M = 1000
VISIBILITY_HAZE_M = 5000
RVR_LIMIT_M = 1500
MIN_VIS_ABSOLUTE_M = 1500
MIN_VIS_RELATIVE_LIMIT_M = 5000


def _rule(code: str) -> str:
    return {
        "metar": "WMO-No. 306 FM 15; ICAO Annex 3 App. 3",
        "taf": "WMO-No. 306 FM 51; ICAO Annex 3 App. 5",
    }[code]


@dataclass
class _Report:
    kind: Kind
    issues: list[AviationIssue] = field(default_factory=list)

    def add(
        self,
        severity: Literal["error", "warning"],
        code: str,
        message: str,
        group: str | None = None,
    ) -> None:
        self.issues.append(
            AviationIssue(
                severity=severity,
                code=code,
                group=group,
                message=message,
                rule=_rule("taf" if self.kind == "TAF" else "metar"),
            )
        )

    def error(self, code: str, message: str, group: str | None = None) -> None:
        self.add("error", code, message, group)

    def warn(self, code: str, message: str, group: str | None = None) -> None:
        self.add("warning", code, message, group)


# --- element checks (shared by METAR, SPECI, TAF and trend) -------------------


def _check_wind(
    r: _Report, token: str, match: re.Match[str]
) -> tuple[int | None, bool]:
    """Return (mean speed in the group's unit or None, is_variable)."""
    direction, speed, gust, unit = match.groups()
    kt = unit == "KT"
    vrb_limit, gust_step = (3, 10) if kt else (2, 5)
    if speed == "//" or direction == "///":
        return None, False
    mean = int(speed)
    variable = direction == "VRB"
    if not variable:
        degrees = int(direction)
        if mean == 0 and degrees != 0:
            r.error(
                "wind_calm",
                "Calm wind is 00000 (dddff); direction must be 000 when speed is 00.",
                token,
            )
        elif mean > 0 and degrees == 0:
            r.error(
                "wind_north",
                "North is 360, not 000; 000 is only for calm wind (00000KT).",
                token,
            )
        elif degrees > 360 or degrees % 10:  # noqa: PLR2004
            r.error(
                "wind_direction",
                "Wind direction is rounded to the nearest 10 degrees, 010 to 360.",
                token,
            )
    elif mean >= vrb_limit:
        r.warn(
            "wind_vrb",
            f"VRB is for mean speed below {vrb_limit} {unit} (or direction that "
            "cannot be determined, such as thunderstorm).",
            token,
        )
    if gust is not None:
        if int(gust) - mean < gust_step:
            r.error(
                "wind_gust",
                f"Gusts are reported only when they exceed the mean speed by "
                f"{gust_step} {unit} or more.",
                token,
            )
        if int(gust) > 99 and len(gust) != 3:  # noqa: PLR2004
            r.error("wind_gust", "Gust speed has two or three digits.", token)
    return mean, variable


def _check_variation(
    r: _Report,
    token: str,
    match: re.Match[str],
    mean: int | None,
    variable: bool,
    unit: str,
) -> None:
    low, high = int(match.group(1)), int(match.group(2))
    if variable:
        r.error("variation_with_vrb", "Wind variation is not reported with VRB.", token)
        return
    if any(v % 10 or not 0 < v <= 360 for v in (low, high)):  # noqa: PLR2004
        r.error(
            "variation_direction",
            "Variation limits are 010 to 360 degrees in steps of 10.",
            token,
        )
        return
    extent = (high - low) % 360
    limit = 3 if unit == "KT" else 2
    if mean is not None and mean < limit:
        r.error(
            "variation_speed",
            f"Wind variation is reported only when mean speed is {limit} {unit} "
            "or more.",
            token,
        )
    if not 60 <= extent < 180:  # noqa: PLR2004
        r.error(
            "variation_extent",
            "Report the variation dndndnVdxdxdx (clockwise) only when it is 60 "
            "degrees or more and less than 180 degrees; at 180 or more use VRB.",
            token,
        )


def _visibility_step_ok(metres: int) -> bool:
    if metres < 800:  # noqa: PLR2004
        return metres % 50 == 0
    if metres < 5000:  # noqa: PLR2004
        return metres % 100 == 0
    return metres == CAVOK_VIS_M or metres % 1000 == 0


def _check_visibility(r: _Report, token: str, match: re.Match[str]) -> int:
    if match.group(1) == "////":
        return -1
    metres = int(match.group(1))
    if not _visibility_step_ok(metres):
        r.error(
            "visibility_step",
            "Visibility steps: 50 m below 800 m, 100 m to 5 km, then 1 km; "
            "9999 means 10 km or more.",
            token,
        )
    if 9000 < metres < CAVOK_VIS_M:  # noqa: PLR2004
        r.error("visibility_step", "Use 9999 for 10 km or more.", token)
    return metres


def _check_rvr(r: _Report, token: str, match: re.Match[str]) -> int:
    runway, _, mod1, first, mod2, second, _trend = match.groups()
    if not 1 <= int(runway) <= 36:  # noqa: PLR2004
        r.error("rvr_runway", "Runway designator is 01 to 36.", token)
    values = [(mod1, first)] + ([(mod2, second)] if second else [])
    for modifier, digits in values:
        metres = int(digits)
        if modifier == "P" and metres != 2000:  # noqa: PLR2004
            r.error("rvr_limit", "P is followed by the upper limit, P2000.", token)
        elif modifier == "M" and metres != 50:  # noqa: PLR2004
            r.error("rvr_limit", "M is followed by the lower limit, M0050.", token)
        elif modifier is None:
            if not 50 <= metres <= 2000:  # noqa: PLR2004
                r.error(
                    "rvr_range",
                    "RVR is reported from 50 m to 2000 m (M0050 / P2000 outside).",
                    token,
                )
            step = 25 if metres < 400 else 50 if metres <= 800 else 100  # noqa: PLR2004
            if metres % step:
                r.error(
                    "rvr_step",
                    "RVR steps: 25 m below 400 m, 50 m from 400 to 800 m, "
                    "100 m above 800 m.",
                    token,
                )
    return min(int(v) for _, v in values)


def _check_weather(
    r: _Report, token: str, match: re.Match[str], visibility: int | None
) -> bool:
    """Check one w'w' group; return True if it names a reduction (BR/FG/...)."""
    intensity, desc, ph = match.group("int"), match.group("desc"), match.group("ph")
    if not desc and not ph:
        return False
    precip = re.findall(PRECIP, ph) if ph and re.fullmatch(f"(?:{PRECIP})+", ph) else []
    bad: str | None = None
    if desc in ("MI", "BC", "PR") and ph != "FG":
        bad = f"{desc} is used with FG only."
    elif desc in ("DR", "BL") and ph not in ("DU", "SA", "SN", None):
        bad = f"{desc} is used with DU, SA or SN."
    elif desc in ("DR", "BL", "MI", "BC", "PR") and ph is None:
        bad = f"{desc} needs a phenomenon after it."
    elif desc == "SH" and not (
        (ph is None and intensity == "VC")
        or (
            precip
            and all(p in ("RA", "SN", "GR", "GS", "PL", "SG", "UP") for p in precip)
        )
    ):
        bad = "SH goes with RA, SN, GR, GS, PL or SG (not DZ), or VCSH."
    elif (
        desc == "TS"
        and ph is not None
        and not (
            precip
            and all(p in ("RA", "SN", "GR", "GS", "PL", "SG", "UP") for p in precip)
        )
    ):
        bad = "TS is alone or with RA, SN, GR, GS, PL, SG."
    elif desc == "FZ" and ph not in ("DZ", "RA", "FG", "UP"):
        bad = "FZ goes with DZ, RA or FG."
    elif intensity == "VC" and (
        precip
        or ph in ("BR", "HZ", "FU", "DU", "SA", "SQ")
        or (ph is None and desc not in ("TS", "SH"))
    ):
        bad = "VC goes with TS, SH, FG, FC, PO, VA, DS, SS, BLDU, BLSA or BLSN."
    elif intensity == "VC" and desc in ("DR", "MI", "BC", "PR", "FZ"):
        bad = "VC is not combined with this descriptor."
    elif intensity in ("+", "-") and (
        ph in ("BR", "FG", "FU", "VA", "DU", "SA", "HZ", "PO", "SQ")
        or (ph == "FC" and intensity == "-")
        or (ph is None and desc not in ("TS", "SH"))
    ):
        bad = "Intensity (+ or -) applies to precipitation, TS, SH, FC, DS and SS."
    if bad:
        r.error("weather_combination", bad, token)
    if visibility is not None and not bad:
        fog_like = ph == "FG" and desc not in ("MI", "BC", "PR") and intensity != "VC"
        if fog_like and visibility >= VISIBILITY_FOG_M:
            r.error(
                "fog_visibility",
                "FG is reported only when visibility is below 1000 m "
                "(use BR from 1000 m to 5000 m, or MIFG/BCFG/PRFG).",
                token,
            )
        if ph == "BR" and not VISIBILITY_FOG_M <= visibility <= VISIBILITY_HAZE_M:
            r.error(
                "mist_visibility",
                "BR is reported when visibility is 1000 m to 5000 m.",
                token,
            )
        if (
            ph in ("HZ", "FU", "DU", "SA", "VA")
            and not desc
            and intensity != "VC"
            and visibility > VISIBILITY_HAZE_M
        ):
            r.error(
                "reduction_visibility",
                f"{ph} is reported only when visibility is 5000 m or less.",
                token,
            )
    return ph in ("BR", "FG", "FU", "VA", "DU", "SA", "HZ")


def _hundreds_ok(code: str) -> bool:
    return code == "///" or int(code) < 100 or int(code) % 10 == 0  # noqa: PLR2004


@dataclass
class _Layer:
    amount: str
    feet: int | None
    kind: str | None


def _check_cloud_layers(r: _Report, layers: list[_Layer], tokens: list[str]) -> None:
    ordinary = [(lay, t) for lay, t in zip(layers, tokens, strict=True) if not lay.kind]
    if len(layers) > MAX_CLOUD_LAYERS:
        r.error(
            "cloud_layers",
            "At most four cloud groups (three layers plus CB/TCU).",
            None,
        )
    elif len(ordinary) > MAX_CLOUD_LAYERS - 1:
        r.error(
            "cloud_layers",
            "At most three cloud layers, plus one CB or TCU layer.",
            None,
        )
    # Layer progression: lowest first (any amount), second > 2 oktas (SCT+),
    # third > 4 oktas (BKN+); CB/TCU may be reported in addition (App. 3 4.5.4).
    previous: int | None = None
    for index, (layer, token) in enumerate(ordinary):
        if index == 1 and layer.amount == "FEW":
            r.error(
                "cloud_progression",
                "A second layer must be SCT, BKN or OVC (more than 2 oktas).",
                token,
            )
        if index == 2 and layer.amount in ("FEW", "SCT"):  # noqa: PLR2004
            r.error(
                "cloud_progression",
                "A third layer must be BKN or OVC (more than 4 oktas).",
                token,
            )
        if layer.feet is not None:
            if previous is not None and layer.feet <= previous:
                r.error(
                    "cloud_order",
                    "Report cloud layers from the lowest base upward.",
                    token,
                )
            previous = layer.feet


def _feet(code: str) -> int | None:
    return None if code == "///" else int(code) * 100


# --- section scanner shared by METAR body, trend and TAF groups ---------------

ORDER = {
    "wind": 0,
    "variation": 1,
    "visibility": 2,
    "minvis": 3,
    "rvr": 4,
    "weather": 5,
    "cloud": 6,
    "temperature": 7,
    "qnh": 8,
    "recent": 9,
    "shear": 10,
}
STAGE_NAMES = {v: k for k, v in ORDER.items()}


@dataclass
class _Section:
    wind: tuple[int | None, bool, str] | None = None
    visibility: int | None = None
    weather: list[str] = field(default_factory=list)
    reduction: bool = False
    layers: list[_Layer] = field(default_factory=list)
    layer_tokens: list[str] = field(default_factory=list)
    cavok: bool = False
    sky_state: str | None = None
    vertical_vis: bool = False
    has_cb: bool = False
    seen_nsw: bool = False
    stage: int = -1
    rvr_min: int | None = None
    visibility_missing: bool = False
    seen: set[str] = field(default_factory=set)

    @property
    def has_cloud_info(self) -> bool:
        return bool(self.layers or self.sky_state or self.vertical_vis or self.cavok)

    @property
    def has_visibility(self) -> bool:
        return self.visibility is not None or self.cavok or self.visibility_missing


def _enter(r: _Report, section: _Section, name: str, token: str) -> None:
    rank = ORDER[name]
    if rank < section.stage:
        r.error(
            "group_order",
            f"{token} is out of order: {name} groups come before "
            f"{STAGE_NAMES[section.stage]} groups.",
            token,
        )
    section.stage = max(section.stage, rank)


def _scan_element(
    r: _Report, section: _Section, token: str, *, allow_nsw: bool = False
) -> bool:
    """Consume one forecast/observation element token; False if unrecognised."""
    if (m := WIND.match(token)) and token != "NOSIG":
        if section.wind is not None:
            r.error("duplicate_group", "More than one wind group.", token)
        _enter(r, section, "wind", token)
        mean, variable = _check_wind(r, token, m)
        section.wind = (mean, variable, m.group(4))
        return True
    if token == CAVOK:
        _enter(r, section, "cloud", token)
        if section.cavok or section.visibility is not None or section.layers:
            r.error(
                "cavok_conflict", "CAVOK replaces visibility, weather and cloud.", token
            )
        section.cavok = True
        return True
    if (
        (m := VISIBILITY.match(token))
        and section.visibility is None
        and not section.visibility_missing
        and ORDER["visibility"] >= section.stage
    ):
        _enter(r, section, "visibility", token)
        metres = _check_visibility(r, token, m)
        section.visibility = metres if metres >= 0 else None
        section.visibility_missing = metres < 0
        if section.cavok:
            r.error("cavok_conflict", "Visibility is not reported with CAVOK.", token)
        return True
    if token == "NSW" and allow_nsw:
        _enter(r, section, "weather", token)
        section.seen_nsw = True
        return True
    if token in SKY_STATES:
        _enter(r, section, "cloud", token)
        section.sky_state = token
        if token == "CLR":
            r.warn("sky_clr", "CLR is for automatic stations; use NSC or SKC.", token)
        if section.layers or section.cavok:
            r.error(
                "cloud_conflict",
                f"{token} cannot be combined with other cloud groups.",
                token,
            )
        return True
    if VERTICAL_VIS.match(token):
        _enter(r, section, "cloud", token)
        section.vertical_vis = True
        if section.layers or section.cavok or section.sky_state:
            r.error("cloud_conflict", "VV is reported instead of cloud layers.", token)
        return True
    if m := CLOUD.match(token):
        _enter(r, section, "cloud", token)
        amount, height, kind = m.groups()
        if not _hundreds_ok(height):
            r.error(
                "cloud_height_step",
                "Cloud heights are in steps of 100 ft up to 10 000 ft and "
                "1000 ft above.",
                token,
            )
        if section.cavok or section.sky_state or section.vertical_vis:
            r.error("cloud_conflict", "Cloud layers conflict with CAVOK/NSC/VV.", token)
        layer_kind = kind if kind in ("CB", "TCU") else None
        section.has_cb = section.has_cb or layer_kind is not None
        section.layers.append(_Layer(amount, _feet(height), layer_kind))
        section.layer_tokens.append(token)
        return True
    if (m := WEATHER.match(token)) and token:
        if not (m.group("desc") or m.group("ph")):
            return False
        _enter(r, section, "weather", token)
        section.weather.append(token)
        if len(section.weather) > MAX_WEATHER_GROUPS:
            r.warn("weather_groups", "At most three present-weather groups.", token)
        section.reduction = (
            _check_weather(r, token, m, section.visibility) or section.reduction
        )
        if section.cavok:
            r.error("cavok_conflict", "Weather is not reported with CAVOK.", token)
        return True
    return False


def _cavok_expected(section: _Section) -> bool:
    return (
        not section.cavok
        and section.sky_state != "NCD"
        and section.visibility == CAVOK_VIS_M
        and not section.weather
        and not section.vertical_vis
        and not section.has_cb
        and all(
            layer.feet is None or layer.feet >= CAVOK_CEILING_FT
            for layer in section.layers
        )
        and section.has_cloud_info
    )


def _finish_section(r: _Report, section: _Section, *, label: str) -> None:
    if section.layers:
        _check_cloud_layers(r, section.layers, section.layer_tokens)
    if _cavok_expected(section):
        r.warn(
            "cavok_expected",
            f"{label}: visibility 10 km or more, no weather, no CB/TCU and no "
            "cloud below 5000 ft: report CAVOK.",
        )


# --- time helpers --------------------------------------------------------------


def _valid_time(day: str, hour: str, minute: str | None = None) -> bool:
    return (
        1 <= int(day) <= 31  # noqa: PLR2004
        and int(hour) <= 23  # noqa: PLR2004
        and (minute is None or int(minute) <= 59)  # noqa: PLR2004
    )


def _clock(token: str) -> tuple[str, str, str] | None:
    m = TIME_Z.match(token)
    return m.groups() if m else None  # type: ignore[return-value]


# --- header ---------------------------------------------------------------------


def _split(text: str) -> list[str]:
    cleaned = text.strip()
    if cleaned.endswith("="):
        cleaned = cleaned[:-1]
    return cleaned.split()


def _check_terminator(r: _Report, text: str) -> None:
    if not text.strip().endswith("="):
        r.warn(
            "no_terminator",
            "End the message with = (end-of-message symbol) before transmission.",
        )
    if text.count("=") > 1:
        r.error("terminator", "A single message ends with one =.")


def _header(
    r: _Report,
    tokens: list[str],
    kind: Kind,
    station: str,
    observed_at: datetime | None,
) -> tuple[int, tuple[str, str, str] | None]:
    """Consume METAR/SPECI header groups; return (next index, (YY, GG, gg))."""
    i = 0
    if tokens and tokens[0] in ("METAR", "SPECI"):
        if tokens[0] != kind:
            r.error(
                "type_mismatch",
                f"The message says {tokens[0]} but the draft is a {kind}.",
                tokens[0],
            )
        i = 1
    else:
        r.error("missing_type", f"Start the message with {kind}.")
    if i < len(tokens) and tokens[i] in ("COR", "CCA", "CCB"):
        i += 1
    if i >= len(tokens) or not ICAO.match(tokens[i]):
        r.error("missing_location", "The ICAO location indicator (CCCC) follows.")
        return i, None
    if tokens[i] != station:
        r.error(
            "station_mismatch",
            f"Message location {tokens[i]} differs from the draft station {station}.",
            tokens[i],
        )
    i += 1
    clock = _clock(tokens[i]) if i < len(tokens) else None
    if clock is None or not _valid_time(*clock):
        r.error(
            "observation_time",
            "Observation time is YYGGggZ (day 01-31, hour 00-23, minute 00-59).",
            tokens[i] if i < len(tokens) else None,
        )
        return i + 1, None
    if observed_at is not None and (
        observed_at.day,
        observed_at.hour,
        observed_at.minute,
    ) != tuple(int(v) for v in clock):
        r.error(
            "time_mismatch",
            "YYGGggZ differs from the observation time entered for this draft.",
            tokens[i],
        )
    if kind == "METAR" and int(clock[2]) not in (0, 30):
        r.warn(
            "metar_minutes",
            "Routine METAR are made at H+00 and H+30; use SPECI for other times.",
            tokens[i],
        )
    return i + 1, clock


def _speci_plausible(section: _Section) -> bool:
    visibility = section.visibility
    ceiling = min(
        (
            layer.feet
            for layer in section.layers
            if layer.amount in ("BKN", "OVC") and layer.feet is not None
        ),
        default=None,
    )
    wind = section.wind
    return bool(
        (visibility is not None and visibility < 5000)  # noqa: PLR2004
        or (ceiling is not None and ceiling <= 1500)  # noqa: PLR2004
        or section.vertical_vis
        or section.has_cb
        or any(
            any(p in w for p in SIGNIFICANT_PHENOMENA) or w.startswith("+")
            for w in section.weather
        )
        or (wind is not None and wind[0] is not None and wind[0] >= 25)  # noqa: PLR2004
    )


def _trend(r: _Report, tokens: list[str], obs: tuple[str, str, str] | None) -> None:
    """Trend forecast: NOSIG, or BECMG/TEMPO [FM TL AT] elements."""
    i = 0
    seen_nosig = seen_change = False
    while i < len(tokens):
        token = tokens[i]
        if token == "NOSIG":
            seen_nosig = True
            i += 1
            continue
        if token not in ("BECMG", "TEMPO"):
            r.error("trend_group", f"{token} is not a trend element.", token)
            i += 1
            continue
        seen_change = True
        i += 1
        times: list[str] = []
        while i < len(tokens) and TREND_TIME.match(tokens[i]):
            times.append(tokens[i])
            i += 1
        if not times:
            r.warn(
                "trend_time",
                f"{token} without FM/TL/AT covers the whole two-hour trend period.",
                token,
            )
        _check_trend_times(r, times, obs)
        section = _Section()
        while i < len(tokens) and tokens[i] not in ("BECMG", "TEMPO", "NOSIG"):
            if not _scan_element(r, section, tokens[i], allow_nsw=True):
                r.error(
                    "trend_group",
                    f"{tokens[i]} is not valid in a trend forecast "
                    "(wind, visibility, weather, cloud, CAVOK only).",
                    tokens[i],
                )
            i += 1
        if not (
            section.wind
            or section.has_visibility
            or section.weather
            or section.seen_nsw
            or section.has_cloud_info
        ):
            r.error("trend_empty", f"{token} states no change element.", token)
        _finish_section(r, section, label=token)
    if seen_nosig and seen_change:
        r.error("trend_nosig", "NOSIG cannot be combined with BECMG or TEMPO.", "NOSIG")


def _check_trend_times(
    r: _Report, times: list[str], obs: tuple[str, str, str] | None
) -> None:
    prefixes = [t[:2] for t in times]
    if len(set(prefixes)) != len(prefixes) or prefixes != sorted(
        prefixes, key=["FM", "TL", "AT"].index
    ):
        r.error(
            "trend_time",
            "Use FM, then TL, or AT, once each (e.g. BECMG FM1030 TL1130).",
            " ".join(times),
        )
    for token in times:
        m = TREND_TIME.match(token)
        if m and (int(m.group(2)) > 24 or int(m.group(3)) > 59):  # noqa: PLR2004
            r.error("trend_time", "Trend times are hhmm UTC.", token)
        elif m and obs and obs[2].isdigit():
            start = int(obs[1]) * 60 + int(obs[2])
            at = int(m.group(2)) * 60 + int(m.group(3))
            if (at - start) % 1440 > MAX_TREND_MINUTES:
                r.error(
                    "trend_period",
                    "A trend covers the two hours after the observation time.",
                    token,
                )


def _validate_metar(
    r: _Report, text: str, station: str, observed_at: datetime | None
) -> None:
    tokens = _split(text)
    if "RMK" in tokens:
        tokens = tokens[: tokens.index("RMK")]
    index, clock = _header(r, tokens, r.kind, station, observed_at)
    if index < len(tokens) and tokens[index] == "NIL":
        if index + 1 < len(tokens):
            r.error("nil_content", "NIL ends the message: no groups follow.", "NIL")
        return
    if index < len(tokens) and tokens[index] == "AUTO":
        index += 1
    section = _Section()
    trend_start = len(tokens)
    for position in range(index, len(tokens)):
        token = tokens[position]
        if token in ("NOSIG", "BECMG", "TEMPO"):
            trend_start = position
            break
        if m := WIND_VARIATION.match(token):
            _enter(r, section, "variation", token)
            if section.wind is None:
                r.error(
                    "variation_order", "Wind variation follows the wind group.", token
                )
            else:
                _check_variation(
                    r, token, m, section.wind[0], section.wind[1], section.wind[2]
                )
            continue
        if (
            (m := VISIBILITY.match(token))
            and section.visibility is not None
            and ORDER["minvis"] >= section.stage
        ):
            _enter(r, section, "minvis", token)
            _check_min_visibility(r, token, m, section.visibility)
            continue
        if m := RVR.match(token):
            _enter(r, section, "rvr", token)
            low = _check_rvr(r, token, m)
            section.rvr_min = (
                low if section.rvr_min is None else min(section.rvr_min, low)
            )
            continue
        if m := TEMPERATURE.match(token):
            _enter(r, section, "temperature", token)
            _check_temperature(r, token, m)
            section.stage = max(section.stage, ORDER["temperature"])
            section.seen.add("temperature")
            continue
        if m := QNH.match(token):
            _enter(r, section, "qnh", token)
            _check_qnh(r, token, m)
            section.seen.add("qnh")
            continue
        if RECENT.match(token):
            _enter(r, section, "recent", token)
            continue
        if token == "WS" or WINDSHEAR.match(token):
            _enter(r, section, "shear", token)
            continue
        if not _scan_element(r, section, token):
            r.error(
                "unknown_group",
                f"{token} is not a recognised METAR/SPECI group.",
                token,
            )
    _require_groups(r, section)
    _finish_section(r, section, label="Report")
    _cross_checks(r, section)
    if r.kind == "SPECI" and not _speci_plausible(section):
        r.warn(
            "speci_criteria",
            "No SPECI criterion is visible in this report (visibility, ceiling, "
            "thunderstorm, freezing/heavy precipitation, wind change). Check "
            "Annex 3 App. 3 2.3 against the previous report.",
        )
    _trend(r, tokens[trend_start:], clock)


def _require_groups(r: _Report, section: _Section) -> None:
    seen = section.seen
    if section.wind is None:
        r.error("missing_wind", "Surface wind group (dddffKT) is missing.")
    if not section.has_visibility:
        r.error("missing_visibility", "Visibility (VVVV) or CAVOK is missing.")
    if not section.has_cloud_info:
        r.error(
            "missing_cloud",
            "Cloud (FEW/SCT/BKN/OVC, VV, NSC/NCD) or CAVOK is missing.",
        )
    if "temperature" not in seen:
        r.error(
            "missing_temperature", "Air/dew-point temperature (T'T'/T'dT'd) is missing."
        )
    if "qnh" not in seen:
        r.error("missing_qnh", "Pressure group (QPHPHPHPH) is missing.")


def _cross_checks(r: _Report, section: _Section) -> None:
    thunder = any("TS" in w and not w.startswith("VC") for w in section.weather)
    if thunder and not section.has_cb and not section.cavok:
        r.warn(
            "ts_without_cb",
            "Thunderstorm reported without CB/TCU cloud in the cloud groups.",
        )
    if (
        section.visibility is not None
        and section.visibility < RVR_LIMIT_M
        and section.rvr_min is None
    ):
        r.warn(
            "rvr_missing",
            "Visibility below 1500 m: report RVR for runways with a measuring "
            "system (R..RVR groups).",
        )


def _check_min_visibility(
    r: _Report, token: str, match: re.Match[str], prevailing: int
) -> None:
    metres = int(match.group(1))
    if match.group(2) in (None, "NDV"):
        r.error(
            "minvis_direction",
            "Minimum visibility is followed by its compass direction (e.g. 1200SW).",
            token,
        )
    if not _visibility_step_ok(metres):
        r.error(
            "visibility_step",
            "Visibility steps: 50 m below 800 m, 100 m to 5 km, then 1 km.",
            token,
        )
    if metres >= prevailing:
        r.error(
            "minvis_value",
            "Minimum visibility is lower than the prevailing visibility.",
            token,
        )
    elif not (
        metres < MIN_VIS_ABSOLUTE_M
        or (metres < prevailing / 2 and metres < MIN_VIS_RELATIVE_LIMIT_M)
    ):
        r.warn(
            "minvis_criteria",
            "Report minimum visibility when it is below 1500 m, or below 50 % of "
            "the prevailing visibility and below 5000 m.",
            token,
        )


def _signed(value: str) -> int:
    return -int(value[1:]) if value.startswith("M") else int(value)


def _check_temperature(r: _Report, token: str, match: re.Match[str]) -> None:
    air, dew = match.groups()
    if dew is None:
        r.warn(
            "dewpoint_missing",
            "Dew point missing: use T'T'/ with nothing after /.",
            token,
        )
        return
    if _signed(dew) > _signed(air):
        r.error(
            "dewpoint_above_air",
            "Dew point cannot be above the air temperature.",
            token,
        )
    for part in (air, dew):
        if not -80 <= _signed(part) <= 60:  # noqa: PLR2004
            r.warn("temperature_range", "Temperature is outside -80 to 60 C.", token)


def _check_qnh(r: _Report, token: str, match: re.Match[str]) -> None:
    if match.group(1):
        if not 850 <= int(match.group(2)) <= 1090:  # noqa: PLR2004
            r.warn("qnh_range", "QNH is outside 850 to 1090 hPa.", token)
    elif not 2500 <= int(match.group(4)) <= 3200:  # noqa: PLR2004
        r.warn("qnh_range", "Altimeter setting is outside 25.00 to 32.00 inHg.", token)


# --- TAF -------------------------------------------------------------------------


class _Calendar:
    """Hours counted from the validity start; None when month roll-over is ambiguous."""

    def __init__(self, start_day: int, month_days: int | None) -> None:
        self.start_day = start_day
        self.month_days = month_days

    def hours(self, day: int, hour: int) -> int | None:
        delta = day - self.start_day
        if delta < 0:
            if self.month_days is None:
                return None
            delta += self.month_days
        return delta * 24 + hour


def _month_days(*moments: datetime | None) -> int | None:
    import calendar  # noqa: PLC0415

    for moment in moments:
        if moment is not None:
            return calendar.monthrange(moment.year, moment.month)[1]
    return None


def _taf_header(
    r: _Report,
    tokens: list[str],
    station: str,
    issued_at: datetime | None,
    valid_from: datetime | None,
    valid_to: datetime | None,
) -> tuple[int, _Calendar | None, tuple[int, int] | None]:
    i = 0
    if tokens and tokens[0] == "TAF":
        i = 1
    else:
        r.error("missing_type", "Start the message with TAF.")
    if i < len(tokens) and tokens[i] in ("AMD", "COR", "CCA", "CCB"):
        i += 1
    if i >= len(tokens) or not ICAO.match(tokens[i]):
        r.error("missing_location", "The ICAO location indicator (CCCC) follows.")
        return i, None, None
    if tokens[i] != station:
        r.error(
            "station_mismatch",
            f"Message location {tokens[i]} differs from the draft station {station}.",
            tokens[i],
        )
    i += 1
    clock = _clock(tokens[i]) if i < len(tokens) else None
    if clock is None or not _valid_time(*clock):
        r.error(
            "issue_time",
            "Issue time is YYGGggZ (day 01-31, hour 00-23, minute 00-59).",
            tokens[i] if i < len(tokens) else None,
        )
        return i + 1, None, None
    issue_token = tokens[i]
    if issued_at is not None and (
        issued_at.day,
        issued_at.hour,
        issued_at.minute,
    ) != tuple(int(v) for v in clock):
        r.error(
            "time_mismatch",
            "YYGGggZ differs from the issue time entered for this draft.",
            issue_token,
        )
    i += 1
    if i < len(tokens) and tokens[i] == "NIL":
        return len(tokens), None, None
    period = TAF_PERIOD.match(tokens[i]) if i < len(tokens) else None
    if not period:
        r.error(
            "validity",
            "Validity period is YYG1G1/YYG2G2, for example 1812/1912.",
            tokens[i] if i < len(tokens) else None,
        )
        return i, None, None
    d1, h1, d2, h2 = (int(v) for v in period.groups())
    token = tokens[i]
    if not (
        1 <= d1 <= 31 and 1 <= d2 <= 31 and h1 <= 24 and h2 <= 24  # noqa: PLR2004
    ):
        r.error("validity", "Validity days are 01-31 and hours 00-24.", token)
        return i + 1, None, None
    calendar = _Calendar(d1, _month_days(issued_at, valid_from, valid_to))
    start, end = calendar.hours(d1, h1), calendar.hours(d2, h2)
    if start is not None and end is not None:
        length = end - start
        if not MIN_TAF_HOURS <= length <= MAX_TAF_HOURS:
            r.error(
                "validity_length",
                f"A TAF is valid for 6 to 30 hours; this one covers {length} h.",
                token,
            )
        issue_hours = calendar.hours(int(clock[0]), int(clock[1]))
        if (
            issue_hours is not None
            and issue_hours > start + 1
            and tokens[0:2] == ["TAF", station]
        ):
            r.warn(
                "issue_after_start",
                "The TAF is issued after its validity begins.",
                token,
            )
    _check_validity_inputs(r, period, valid_from, valid_to, token)
    return (
        i + 1,
        calendar,
        (start or 0, end or 0) if start is not None and end is not None else None,
    )


def _check_validity_inputs(
    r: _Report,
    period: re.Match[str],
    valid_from: datetime | None,
    valid_to: datetime | None,
    token: str,
) -> None:
    d1, h1, d2, h2 = (int(v) for v in period.groups())
    if valid_from and (valid_from.day, valid_from.hour) != (d1, h1):
        r.error(
            "time_mismatch",
            "Validity start differs from the draft's validity start.",
            token,
        )
    if valid_to and (valid_to.day, valid_to.hour) != (d2, h2 % 24):
        r.error(
            "time_mismatch",
            "Validity end differs from the draft's validity end.",
            token,
        )


def _pair_period(
    r: _Report,
    token: str,
    cal: _Calendar | None,
    window: tuple[int, int] | None,
    group: str,
) -> tuple[int | None, int | None]:
    m = TAF_PERIOD.match(token)
    if not m:
        r.error("change_period", f"{group} is followed by YYG1G1/YYG2G2.", token)
        return None, None
    d1, h1, d2, h2 = (int(v) for v in m.groups())
    if h1 > 23 or h2 > 24 or not (1 <= d1 <= 31 and 1 <= d2 <= 31):  # noqa: PLR2004
        r.error(
            "change_period",
            "Hours are 00-23 for the start and 00-24 for the end.",
            token,
        )
        return None, None
    if cal is None:
        return None, None
    start, end = cal.hours(d1, h1), cal.hours(d2, h2)
    if start is None or end is None:
        return None, None
    if end <= start:
        r.error("change_period", "The change period must end after it starts.", token)
        return start, end
    if window and (start < window[0] or end > window[1]):
        r.error(
            "change_outside", "The change period lies outside the TAF validity.", token
        )
    limit = MAX_CHANGE_HOURS
    if end - start > limit:
        r.error(
            "change_length",
            f"{group} periods do not exceed {limit} hours.",
            token,
        )
    return start, end


def _taf_elements(
    r: _Report, tokens: list[str], i: int, section: _Section, *, base: bool
) -> int:
    while i < len(tokens):
        token = tokens[i]
        if (
            token in ("BECMG", "TEMPO")
            or PROB.match(token)
            or TAF_FM.match(token)
            or TAF_TEMP.match(token)
        ):
            break
        if (
            RVR.match(token)
            or WIND_VARIATION.match(token)
            or TEMPERATURE.match(token)
            or QNH.match(token)
        ):
            r.error("taf_group", f"{token} is not used in a TAF.", token)
        elif not _scan_element(r, section, token, allow_nsw=not base):
            r.error("unknown_group", f"{token} is not a recognised TAF group.", token)
        i += 1
    return i


def _taf_complete(r: _Report, section: _Section, label: str) -> None:
    if section.wind is None:
        r.error("missing_wind", f"{label}: wind group (dddffKT) is missing.")
    if not section.has_visibility:
        r.error("missing_visibility", f"{label}: visibility or CAVOK is missing.")
    if not section.has_cloud_info:
        r.error("missing_cloud", f"{label}: cloud, NSC, VV or CAVOK is missing.")


def _validate_taf(
    r: _Report,
    text: str,
    station: str,
    issued_at: datetime | None,
    valid_from: datetime | None,
    valid_to: datetime | None,
) -> None:
    tokens = _split(text)
    i, calendar, window = _taf_header(
        r, tokens, station, issued_at, valid_from, valid_to
    )
    if i >= len(tokens):
        return
    if tokens[i] == "CNL":
        if i + 1 < len(tokens):
            r.error("cnl_content", "CNL ends the message: no groups follow.", "CNL")
        if "AMD" not in tokens[:2]:
            r.warn("cnl_amd", "A cancellation is issued as TAF AMD ... CNL.", "CNL")
        return
    base = _Section()
    i = _taf_elements(r, tokens, i, base, base=True)
    _taf_complete(r, base, "Base forecast")
    _finish_section(r, base, label="Base forecast")
    temps: list[tuple[str, int]] = []
    while i < len(tokens) and (m := TAF_TEMP.match(tokens[i])):
        if m.group(1) in [kind for kind, _ in temps]:
            r.error(
                "temperature_repeat",
                f"Only one {m.group(1)} group is allowed.",
                tokens[i],
            )
        temps.append((m.group(1), _signed(m.group(2))))
        if not _valid_time(m.group(3), m.group(4)):
            r.error("temperature_time", "TX/TN time is YYGGZ (day, hour).", tokens[i])
        i += 1
    if len(temps) == 2 and temps[0][0] == "TN":  # noqa: PLR2004
        r.warn("temperature_order", "Report TX before TN.", "TN")
    values = dict(temps)
    if "TX" in values and "TN" in values and values["TX"] < values["TN"]:
        r.error(
            "temperature_extremes", "Maximum temperature is below the minimum.", "TX"
        )
    last_fm: int | None = None
    while i < len(tokens):
        token = tokens[i]
        i += 1
        section = _Section()
        if m := TAF_FM.match(token):
            day, hour, minute = (int(v) for v in m.groups())
            if not (1 <= day <= 31 and hour <= 23 and minute <= 59):  # noqa: PLR2004
                r.error(
                    "fm_time", "FM time is FMYYGGgg (hour 00-23, minute 00-59).", token
                )
            elif (
                calendar is not None
                and (start := calendar.hours(day, hour)) is not None
            ):
                if window and not window[0] <= start < window[1]:
                    r.error(
                        "change_outside",
                        "FM time lies outside the TAF validity.",
                        token,
                    )
                if last_fm is not None and start * 60 + minute <= last_fm:
                    r.error("fm_order", "FM groups follow in time order.", token)
                last_fm = start * 60 + minute
            i = _taf_elements(r, tokens, i, section, base=False)
            _taf_complete(r, section, token)
        elif token in ("BECMG", "TEMPO") or PROB.match(token):
            group = token
            if PROB.match(token):
                if i < len(tokens) and tokens[i] == "TEMPO":
                    group = f"{token} TEMPO"
                    i += 1
                elif i < len(tokens) and tokens[i] in ("BECMG",):
                    r.error(
                        "prob_becmg", "PROB30/40 is not combined with BECMG.", token
                    )
                    i += 1
            if i >= len(tokens):
                r.error(
                    "change_period", f"{group} is followed by YYG1G1/YYG2G2.", token
                )
                break
            _pair_period(r, tokens[i], calendar, window, group)
            i += 1
            i = _taf_elements(r, tokens, i, section, base=False)
            if not (
                section.wind
                or section.has_visibility
                or section.weather
                or section.seen_nsw
                or section.has_cloud_info
            ):
                r.error("change_empty", f"{group} states no change element.", token)
        else:
            r.error("unknown_group", f"{token} is not a recognised TAF group.", token)
            continue
        _finish_section(r, section, label=token)


# --- entry point ---------------------------------------------------------------------


def validate_aviation(
    kind: Kind,
    station: str,
    message: str,
    *,
    observed_at: datetime | None = None,
    issued_at: datetime | None = None,
    valid_from: datetime | None = None,
    valid_to: datetime | None = None,
) -> list[AviationIssue]:
    """Check METAR/SPECI/TAF text; findings are advisory for working drafts."""
    r = _Report(kind)
    text = message.strip()
    if not text:
        r.error("empty", "Enter the coded message.")
        return r.issues
    if re.search(r"[a-z]", text):
        r.error("lowercase", "Coded messages use capital letters only.")
        text = text.upper()
    _check_terminator(r, text)
    if kind == "TAF":
        _validate_taf(r, text, station, issued_at, valid_from, valid_to)
    else:
        _validate_metar(r, text, station, observed_at)
    return r.issues
