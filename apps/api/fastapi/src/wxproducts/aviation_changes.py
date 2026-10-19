"""Change criteria for SPECI and TAF change groups (pure functions; no I/O).

Two ICAO Annex 3 / WMO-No. 49 Vol. II lists drive "has the weather changed
enough to say so": Appendix 3 2.3 (when a SPECI is issued, comparing the new
report with the previous METAR/SPECI) and Appendix 5 1.3 (when a TAF needs a
BECMG, TEMPO or FM change group, comparing it with the prevailing forecast).
Both are advisory here: the composer shows a warning, it never blocks a draft.

The lists share wind, visibility, weather and cloud criteria; they differ in the
visibility and cloud-base thresholds and in the SPECI-only air temperature rise.
Aerodrome-specific criteria agreed locally (for example wind through runway
limits, RVR, snow depth) need data this module does not have and are not
checked.
"""

from collections.abc import Iterable
from dataclasses import dataclass, replace

KT_PER_MPS = 1.94384
# Wind (both lists): direction change of 60 degrees or more with mean speed of
# 10 kt or more before and/or after; mean speed change of 10 kt or more;
# increase in the gust excess over the mean of 10 kt or more with mean speed of
# 15 kt or more before and/or after.
WIND_DIRECTION_CHANGE_DEG = 60
WIND_DIRECTION_MIN_SPEED_KT = 10
WIND_SPEED_CHANGE_KT = 10
GUST_EXCESS_INCREASE_KT = 10
GUST_MIN_MEAN_KT = 15
FULL_CIRCLE_DEG = 360
# Visibility thresholds in metres: improving to or deteriorating through.
# SPECI (App. 3 2.3): 800, 1500, 3000 and, where VFR flights are significant,
# 5000. TAF (App. 5 1.3): 150, 350, 600, 800, 1500, 3000, 5000.
SPECI_VISIBILITY_THRESHOLDS_M = (800, 1500, 3000, 5000)
TAF_VISIBILITY_THRESHOLDS_M = (150, 350, 600, 800, 1500, 3000, 5000)
# Base of the lowest BKN/OVC layer (or vertical visibility), feet: 100 m, 200 m,
# 500 m and 1000 m for SPECI (300, 600, 1500, 3000 ft); 100, 200, 500, 1000 and
# 1500 ft for TAF. The amount-below-1500-ft criterion uses LOW_CLOUD_FT.
SPECI_CEILING_THRESHOLDS_FT = (300, 600, 1500, 3000)
TAF_CEILING_THRESHOLDS_FT = (100, 200, 500, 1000, 1500)
LOW_CLOUD_FT = 1500
CAVOK_VISIBILITY_M = 9999
# Stand-in ceiling for "no BKN/OVC layer": above every threshold.
NO_CEILING_FT = 99_999
# SPECI only (App. 3 2.3, recommendation): air temperature up 2 deg C or more.
SPECI_TEMPERATURE_RISE_C = 2

PRECIPITATION = ("DZ", "RA", "SN", "SG", "PL", "GR", "GS", "UP")
FREEZING_PRECIPITATION = ("FZRA", "FZDZ")


@dataclass(frozen=True)
class Wind:
    direction_deg: int | None
    speed_kt: float
    gust_kt: float | None = None

    @property
    def gust_excess_kt(self) -> float:
        return 0 if self.gust_kt is None else self.gust_kt - self.speed_kt


@dataclass(frozen=True)
class Cloud:
    """Lowest BKN/OVC base (or vertical visibility) in feet; None when there is none."""

    ceiling_ft: int | None


@dataclass(frozen=True)
class ChangeState:
    """What a report or forecast says; None means "not stated"."""

    wind: Wind | None = None
    visibility_m: int | None = None
    weather: frozenset[str] | None = None
    cloud: Cloud | None = None


def to_knots(speed: int, unit: str) -> float:
    return float(speed) if unit == "KT" else speed * KT_PER_MPS


def weather_categories(tokens: Iterable[str]) -> frozenset[str]:
    """Significant phenomena named by the criteria; vicinity and light rain excluded."""
    found: set[str] = set()
    for token in tokens:
        if token.startswith("VC"):
            continue
        intensity = token[0] if token[:1] in "+-" else ""
        body = token.lstrip("+-")
        if any(code in body for code in FREEZING_PRECIPITATION):
            found.add("freezing precipitation")
        elif intensity != "-" and any(code in body for code in PRECIPITATION):
            found.add(
                "heavy precipitation" if intensity == "+" else "moderate precipitation"
            )
        if body.startswith("TS"):
            found.add("thunderstorm")
        if body.endswith(("DS", "SS")):
            found.add("duststorm or sandstorm")
        if body.endswith("FC"):
            found.add("funnel cloud, tornado or waterspout")
        if body.endswith("SQ"):
            found.add("squall")
    return frozenset(found)


def merge(
    before: ChangeState,
    *,
    wind: Wind | None = None,
    visibility_m: int | None = None,
    weather: frozenset[str] | None = None,
    cloud: Cloud | None = None,
) -> ChangeState:
    """Apply the elements a message states on top of the state before it."""
    return replace(
        before,
        wind=wind if wind is not None else before.wind,
        visibility_m=visibility_m if visibility_m is not None else before.visibility_m,
        weather=weather if weather is not None else before.weather,
        cloud=cloud if cloud is not None else before.cloud,
    )


def _crossed(before: float, after: float, thresholds: Iterable[float]) -> list[float]:
    low, high = sorted((before, after))
    return [t for t in thresholds if low < t <= high]


def _direction_gap(a: int, b: int) -> int:
    gap = abs(a - b) % FULL_CIRCLE_DEG
    return min(gap, FULL_CIRCLE_DEG - gap)


def _wind_criteria(before: Wind, after: Wind) -> list[str]:
    found: list[str] = []
    fastest = max(before.speed_kt, after.speed_kt)
    if (
        before.direction_deg is not None
        and after.direction_deg is not None
        and fastest >= WIND_DIRECTION_MIN_SPEED_KT
        and _direction_gap(before.direction_deg, after.direction_deg)
        >= WIND_DIRECTION_CHANGE_DEG
    ):
        found.append(
            f"wind direction changed by "
            f"{_direction_gap(before.direction_deg, after.direction_deg)} degrees "
            f"with a mean speed of {WIND_DIRECTION_MIN_SPEED_KT} kt or more"
        )
    if abs(after.speed_kt - before.speed_kt) >= WIND_SPEED_CHANGE_KT:
        found.append(f"mean wind speed changed by {WIND_SPEED_CHANGE_KT} kt or more")
    if (
        after.gust_excess_kt - before.gust_excess_kt >= GUST_EXCESS_INCREASE_KT
        and fastest >= GUST_MIN_MEAN_KT
    ):
        found.append(
            f"gusts increased by {GUST_EXCESS_INCREASE_KT} kt or more over a "
            f"mean speed of {GUST_MIN_MEAN_KT} kt or more"
        )
    return found


def _cloud_criteria(
    before: Cloud, after: Cloud, thresholds: tuple[int, ...]
) -> list[str]:
    found: list[str] = []
    old = NO_CEILING_FT if before.ceiling_ft is None else before.ceiling_ft
    new = NO_CEILING_FT if after.ceiling_ft is None else after.ceiling_ft
    if _crossed(old, new, thresholds):
        found.append("cloud base of the lowest BKN/OVC layer passed a threshold")
    if (old < LOW_CLOUD_FT) != (new < LOW_CLOUD_FT):
        found.append("cloud below 1500 ft changed between SCT or less and BKN/OVC")
    return found


def change_criteria(
    before: ChangeState,
    after: ChangeState,
    *,
    visibility_thresholds: tuple[int, ...],
    ceiling_thresholds: tuple[int, ...],
) -> list[str]:
    """Criteria met going from `before` to `after`; an element stated on only one side is skipped."""
    found: list[str] = []
    if before.wind is not None and after.wind is not None:
        found.extend(_wind_criteria(before.wind, after.wind))
    if (
        before.visibility_m is not None
        and after.visibility_m is not None
        and _crossed(before.visibility_m, after.visibility_m, visibility_thresholds)
    ):
        found.append("visibility passed a threshold")
    if before.weather is not None and after.weather is not None:
        began = sorted(after.weather - before.weather)
        ended = sorted(before.weather - after.weather)
        if began:
            found.append(f"onset of {', '.join(began)}")
        if ended:
            found.append(f"end of {', '.join(ended)}")
    if before.cloud is not None and after.cloud is not None:
        found.extend(_cloud_criteria(before.cloud, after.cloud, ceiling_thresholds))
    return found


def speci_criteria(
    before: ChangeState,
    after: ChangeState,
    before_temperature_c: int | None,
    after_temperature_c: int | None,
) -> list[str]:
    """Annex 3 App. 3 2.3: a SPECI follows a METAR/SPECI that differs by one of these."""
    found = change_criteria(
        before,
        after,
        visibility_thresholds=SPECI_VISIBILITY_THRESHOLDS_M,
        ceiling_thresholds=SPECI_CEILING_THRESHOLDS_FT,
    )
    if (
        before_temperature_c is not None
        and after_temperature_c is not None
        and after_temperature_c - before_temperature_c >= SPECI_TEMPERATURE_RISE_C
    ):
        found.append(
            f"air temperature rose by {SPECI_TEMPERATURE_RISE_C} degrees C or more"
        )
    return found


def taf_criteria(before: ChangeState, after: ChangeState) -> list[str]:
    """Annex 3 App. 5 1.3: a change group is justified by one of these."""
    return change_criteria(
        before,
        after,
        visibility_thresholds=TAF_VISIBILITY_THRESHOLDS_M,
        ceiling_thresholds=TAF_CEILING_THRESHOLDS_FT,
    )
