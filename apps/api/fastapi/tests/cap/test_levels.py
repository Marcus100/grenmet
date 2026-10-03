import pytest

from src.cap.levels import (
    AWARENESS_PARAMETER,
    PRODUCT_PARAMETER,
    GmsColour,
    GmsProduct,
    awareness_value,
    level_parameters,
    parse_awareness,
    severity_for,
    validate_level,
    with_level_parameters,
)
from src.cap.models import CapSeverity
from src.cap.schemas import CapNameValue


@pytest.mark.parametrize(
    ("colour", "value", "severity"),
    [
        (GmsColour.GREEN, "1; green; Minor", CapSeverity.MINOR),
        (GmsColour.YELLOW, "2; yellow; Moderate", CapSeverity.MODERATE),
        (GmsColour.ORANGE, "3; orange; Severe", CapSeverity.SEVERE),
        (GmsColour.RED, "4; red; Extreme", CapSeverity.EXTREME),
    ],
)
def test_four_colours_follow_the_meteoalarm_profile(
    colour: GmsColour, value: str, severity: CapSeverity
) -> None:
    assert awareness_value(colour) == value
    assert parse_awareness(value) is colour
    assert severity_for(colour) is severity


@pytest.mark.parametrize(
    "value", ["orange", "3; orange", "3; purple; Severe", "2; orange; Severe", ""]
)
def test_malformed_awareness_values_are_rejected(value: str) -> None:
    assert parse_awareness(value) is None


def test_an_outlook_carries_a_product_but_no_colour() -> None:
    assert level_parameters(GmsProduct.OUTLOOK, None) == [
        CapNameValue(value_name=PRODUCT_PARAMETER, value="Outlook")
    ]


def test_level_parameters_replace_old_ones_and_keep_the_rest() -> None:
    existing = [
        CapNameValue(value_name="GMS:hazard-profile", value="heat:v2"),
        CapNameValue(value_name=PRODUCT_PARAMETER, value="Watch"),
        CapNameValue(value_name=AWARENESS_PARAMETER, value="2; yellow; Moderate"),
    ]
    result = with_level_parameters(existing, GmsProduct.WARNING, GmsColour.RED)
    assert [(p.value_name, p.value) for p in result] == [
        ("GMS:hazard-profile", "heat:v2"),
        (PRODUCT_PARAMETER, "Warning"),
        (AWARENESS_PARAMETER, "4; red; Extreme"),
    ]


def _check(
    product: str | None, colour: str | None, severity: CapSeverity
) -> tuple[list[str], list[str]]:
    parameters = []
    if product is not None:
        parameters.append(CapNameValue(value_name=PRODUCT_PARAMETER, value=product))
    if colour is not None:
        parameters.append(CapNameValue(value_name=AWARENESS_PARAMETER, value=colour))
    return validate_level(parameters, severity, "info[1]")


def test_a_consistent_warning_passes() -> None:
    assert _check("Warning", "3; orange; Severe", CapSeverity.SEVERE) == ([], [])


def test_a_missing_product_only_warns_for_legacy_and_imported_alerts() -> None:
    errors, warnings = _check(None, None, CapSeverity.MODERATE)
    assert errors == []
    assert len(warnings) == 1


def test_an_outlook_with_a_colour_is_an_error() -> None:
    errors, _ = _check("Outlook", "2; yellow; Moderate", CapSeverity.MODERATE)
    assert errors == ["info[1]: an Outlook has no colour yet; remove the colour"]


def test_a_watch_needs_a_colour() -> None:
    errors, _ = _check("Watch", None, CapSeverity.UNKNOWN)
    assert errors == ["info[1]: choose a colour for this Watch"]


def test_severity_must_agree_with_the_colour() -> None:
    errors, _ = _check("Warning", "4; red; Extreme", CapSeverity.MODERATE)
    assert errors == ["info[1]: Red requires severity Extreme, not Moderate"]


def test_unknown_product_is_an_error() -> None:
    errors, _ = _check("Bulletin", None, CapSeverity.MINOR)
    assert errors == ["info[1].GMS:product 'Bulletin' is not a product"]
