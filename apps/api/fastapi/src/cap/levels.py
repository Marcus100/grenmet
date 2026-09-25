"""GMS warning levels on CAP: product (Outlook/Watch/Warning/Advisory) and colour.

The GMS impact-based forecasting guidelines (September 2026 draft) keep three
things separate: the hazard (the CAP ``event``), the operational product, and
the impact colour. CAP has no field for either of the last two, so they travel
as ``<parameter>`` entries:

- ``awareness_level`` — the MeteoAlarm CAP profile convention, e.g.
  ``"3; orange; Severe"``. Code, colour and CAP severity in one value, read by
  MeteoAlarm-aware consumers and aggregators.
- ``GMS:product`` — ``Outlook``, ``Watch``, ``Warning`` or ``Advisory`` (the
  latter kept for the marine Small Craft Advisory).

An Outlook is an early heads-up: its colour is "not yet assigned", so it never
carries ``awareness_level``. Every other product must, and the CAP
``severity`` must agree with the colour so consumers that only read severity
(Google Public Alerts, the WMO Alert Hub) see the same level.
"""

from collections.abc import Iterable, Sequence
from enum import Enum

from src.cap.models import CapCertainty, CapSeverity, CapUrgency
from src.cap.schemas import CapNameValue

AWARENESS_PARAMETER = "awareness_level"
PRODUCT_PARAMETER = "GMS:product"


class GmsProduct(str, Enum):
    OUTLOOK = "Outlook"
    WATCH = "Watch"
    WARNING = "Warning"
    ADVISORY = "Advisory"


class GmsColour(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    ORANGE = "orange"
    RED = "red"


# MeteoAlarm awareness code and the CAP severity each colour asserts.
_AWARENESS: dict[GmsColour, tuple[int, CapSeverity]] = {
    GmsColour.GREEN: (1, CapSeverity.MINOR),
    GmsColour.YELLOW: (2, CapSeverity.MODERATE),
    GmsColour.ORANGE: (3, CapSeverity.SEVERE),
    GmsColour.RED: (4, CapSeverity.EXTREME),
}


def severity_for(colour: GmsColour) -> CapSeverity:
    return _AWARENESS[colour][1]


def awareness_value(colour: GmsColour) -> str:
    code, severity = _AWARENESS[colour]
    return f"{code}; {colour.value}; {severity.value}"


def parse_awareness(value: str) -> GmsColour | None:
    """``"3; orange; Severe"`` → ORANGE; anything malformed → None."""
    parts = [part.strip() for part in value.split(";")]
    if len(parts) != 3:
        return None
    try:
        colour = GmsColour(parts[1].lower())
    except ValueError:
        return None
    code, severity = _AWARENESS[colour]
    if parts[0] != str(code) or parts[2] != severity.value:
        return None
    return colour


def level_parameters(
    product: GmsProduct, colour: GmsColour | None
) -> list[CapNameValue]:
    parameters = [CapNameValue(value_name=PRODUCT_PARAMETER, value=product.value)]
    if colour is not None:
        parameters.append(
            CapNameValue(value_name=AWARENESS_PARAMETER, value=awareness_value(colour))
        )
    return parameters


def with_level_parameters(
    existing: Iterable[CapNameValue], product: GmsProduct, colour: GmsColour | None
) -> list[CapNameValue]:
    """Replace any level parameters in ``existing``; keep everything else."""
    kept = [
        parameter
        for parameter in existing
        if parameter.value_name not in {AWARENESS_PARAMETER, PRODUCT_PARAMETER}
    ]
    return [*kept, *level_parameters(product, colour)]


def read_level(
    parameters: Sequence[CapNameValue],
) -> tuple[GmsProduct | None, GmsColour | None]:
    """The product and colour an info block declares; invalid values → None."""
    product: GmsProduct | None = None
    colour: GmsColour | None = None
    for parameter in parameters:
        if parameter.value_name == PRODUCT_PARAMETER:
            try:
                product = GmsProduct(parameter.value)
            except ValueError:
                product = None
        elif parameter.value_name == AWARENESS_PARAMETER:
            colour = parse_awareness(parameter.value)
    if product is GmsProduct.OUTLOOK:
        colour = None
    return product, colour


def outlook_defaults() -> tuple[CapUrgency, CapCertainty]:
    """CAP convention for an early heads-up: expected in the future, possible."""
    return CapUrgency.FUTURE, CapCertainty.POSSIBLE


def validate_level(
    parameters: Sequence[CapNameValue], severity: CapSeverity, prefix: str
) -> tuple[list[str], list[str]]:
    """Errors and warnings for one info block's product and colour.

    A missing product is only a warning: imported feeds and alerts authored
    before this model existed carry none. Everything present must be valid.
    """
    errors: list[str] = []
    warnings: list[str] = []
    values = {
        parameter.value_name: parameter.value
        for parameter in parameters
        if parameter.value_name in {AWARENESS_PARAMETER, PRODUCT_PARAMETER}
    }

    raw_product = values.get(PRODUCT_PARAMETER)
    raw_colour = values.get(AWARENESS_PARAMETER)
    if raw_product is None:
        warnings.append(f"{prefix} has no GMS product (Outlook, Watch, Warning)")
        return errors, warnings
    try:
        product = GmsProduct(raw_product)
    except ValueError:
        errors.append(f"{prefix}.{PRODUCT_PARAMETER} '{raw_product}' is not a product")
        return errors, warnings

    if product is GmsProduct.OUTLOOK:
        if raw_colour is not None:
            errors.append(f"{prefix}: an Outlook has no colour yet; remove the colour")
        return errors, warnings

    if raw_colour is None:
        errors.append(f"{prefix}: choose a colour for this {product.value}")
        return errors, warnings
    colour = parse_awareness(raw_colour)
    if colour is None:
        errors.append(f"{prefix}.{AWARENESS_PARAMETER} '{raw_colour}' is not valid")
        return errors, warnings
    expected = severity_for(colour)
    if severity != expected:
        errors.append(
            f"{prefix}: {colour.value.capitalize()} requires severity "
            f"{expected.value}, not {severity.value}"
        )
    return errors, warnings
