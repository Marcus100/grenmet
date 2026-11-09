"""Product field changes of 9 Nov 2026 (issue #1197): weather types, morning
sun times, marine units and order, alert validity, level and references.
Older revisions must still open and render."""

from uuid import uuid4

from src.wxproducts import forecast_pdf, presentation, service, validation
from tests.wxproducts.test_authoring import actor as actor
from tests.wxproducts.test_authoring import current_input
from tests.wxproducts.test_authoring import weather_sessions as weather_sessions
from tests.wxproducts.test_marine_climate_pdf import MARINE
from tests.wxproducts.test_validation import body, complete


def keys(kind: str) -> list[str]:
    return [rule.key for rule in validation.FIELDS[kind]]


def test_morning_gives_sunset_today_and_sunrise_tomorrow_as_times():
    rules = {rule.key: rule for rule in validation.FIELDS["morning"]}
    assert rules["sunsetToday"].type == "time"
    assert rules["sunriseTomorrow"].type == "time"
    assert "sunsetToday" not in keys("midday")
    tiles = presentation.conditions(
        {"sunsetToday": "18:02", "sunriseTomorrow": "06:01"}
    )
    assert ("sunset", "18:02", "Sunset today") in tiles
    assert ("sunrise", "06:01", "Sunrise tomorrow") in tiles
    errors = validation.validate(
        body("morning", values=complete("morning") | {"sunsetToday": "6 pm"})
    )
    assert "Sunset today: enter a time as HH:MM" in errors


def test_older_morning_with_free_text_sun_times_still_renders():
    values = complete("morning") | {"sunrise": "6:02 am", "sunset": "6:01 pm"}
    assert not validation.validate(body("morning", values=values, action="draft"))
    pdf = forecast_pdf.render_sheet_pdf("morning", values, status="", revision="r1")
    assert pdf.startswith(b"%PDF-")


def test_conditions_section_is_now_weather():
    for kind in forecast_pdf.BULLETIN_NAMES:
        assert all(rule.section != "Conditions" for rule in validation.FIELDS[kind])
    assert {"weather", "systemName", "dust"} <= {
        rule.key
        for kind in ("marine", "cyclone", "dust")
        for rule in validation.FIELDS[kind]
        if rule.section == "Weather"
    }


def test_marine_forecast_fields_follow_the_decided_order():
    order = keys("marine-forecast")
    sequence = [
        "validFrom",
        "advisories",
        "synopsis",
        "windDirFrom",
        "seaStateFrom",
        "waveHeightMin",
        "swellDir",
        "swellHeight",
        "swellPeriod",
        "weatherType",
        "visibilityMin",
        "outlook",
        "tide1Type",
        "sunrise",
        "moonrise",
        "moonPhase",
        "moonPhaseDate",
    ]
    assert [order.index(key) for key in sequence] == sorted(
        order.index(key) for key in sequence
    )
    rules = {rule.key: rule for rule in validation.FIELDS["marine-forecast"]}
    assert rules["moonrise"].type == rules["moonset"].type == "time"
    assert rules["moonPhase"].options == [
        "New moon",
        "Waxing crescent",
        "First quarter",
        "Waxing gibbous",
        "Full moon",
        "Waning gibbous",
        "Last quarter",
        "Waning crescent",
    ]


def test_marine_sheet_prints_weather_tides_and_astronomy():
    values = validation.normalize(
        "marine-forecast",
        complete("marine-forecast")
        | MARINE
        | {
            "weatherType": "showers-light:isolated,haze",
            "visibilityMin": "8",
            "tide1Type": "High",
            "tide1Time": "04:10",
            "tide1Height": "0.6",
            "moonrise": "21:14",
            "moonPhase": "Waning gibbous",
            "moonPhaseDate": "2026-09-08",
        },
    )
    assert values["weatherTypeText"] == "Haze and isolated light showers."
    context = forecast_pdf.marine_forecast_context(values, status="", revision="r1")
    assert context["weather"] == "Haze and isolated light showers."
    assert ("Moonrise", "21:14") in context["astronomy"]
    assert ("Moon phase", "Waning gibbous, Tue 8 Sep") in context["astronomy"]
    assert context["tide_tiles"][0]["value"] == "04:10"
    html = forecast_pdf._environment().get_template("marine.html.j2").render(**context)
    assert html.index("Alerts and advisories in force") < html.index(MARINE["synopsis"])
    assert html.index("Wind (knots)") < html.index("Swell") < html.index("Small craft")
    assert "predicted, not for navigation" in html
    pdf = forecast_pdf.render_sheet_pdf(
        "marine-forecast", values, status="", revision="r1"
    )
    assert pdf.startswith(b"%PDF-")


def test_older_marine_forecast_revision_without_new_fields_renders():
    values = complete("marine-forecast") | MARINE
    context = forecast_pdf.marine_forecast_context(values, status="", revision="r1")
    assert context["astronomy"] == [] and context["tide_tiles"] == []
    pdf = forecast_pdf.render_sheet_pdf(
        "marine-forecast", values, status="", revision="r1"
    )
    assert pdf.startswith(b"%PDF-")


def test_alert_validity_is_rendered_from_the_machine_fields():
    values = validation.normalize(
        "marine", complete("marine") | {"validity": "Typed text", "level": ""}
    )
    assert values["validity"] == (
        "Valid from 05:00 Tue 8 Sep to 05:00 Wed 9 Sep, "
        "or until superseded by the next issue."
    )
    assert values["level"] == "Green"
    context = forecast_pdf.bulletin_context("marine", values, status="", revision="r1")
    assert context["valid"].endswith("or until superseded by the next issue")
    assert all(label != "Archive reference" for label, _ in context["details"])


def test_alert_purpose_label_and_marine_units_in_bulletins():
    rules = {rule.key: rule for rule in validation.FIELDS["marine"]}
    assert rules["notice"].label == "Bulletin purpose"
    assert rules["notice"].options == ["Information", "Advisory", "All clear"]
    values = validation.normalize(
        "marine",
        complete("marine")
        | {"waveHeightMin": "1.5", "waveHeightMax": "2.5", "swellHeight": "2"},
    )
    assert "1.5–2.5 m (5–8 ft)" in values["seaState"]
    # Land alerts keep mph.
    wind = validation.normalize(
        "wind", complete("wind") | {"windDirFrom": "E", "windSpeedMin": "20"}
    )
    assert wind["wind"] == "E 23 mph"


def test_older_alert_revision_with_typed_validity_still_renders():
    values = complete("marine") | {"validity": "Until further notice", "level": "Amber"}
    pdf = forecast_pdf.render_sheet_pdf("marine", values, status="", revision="r1")
    assert pdf.startswith(b"%PDF-")


async def test_alert_gets_a_yearly_reference_kept_across_revisions(
    weather_sessions, actor
):
    first = current_input(action="draft")
    second = current_input(action="draft").model_copy(update={"id": uuid4()})
    year = first.values["issuedAt"][:4]
    async with weather_sessions() as session:
        saved = await service.write_product(session, first, actor)
    async with weather_sessions() as session:
        other = await service.write_product(session, second, actor)
    assert saved.draft["values"]["reference"] == f"GMS-MARINE-{year}-001"
    assert other.draft["values"]["reference"] == f"GMS-MARINE-{year}-002"
    # The desk posts values back without the reference: it is kept.
    async with weather_sessions() as session:
        again = await service.write_product(
            session, first.model_copy(update={"expectedRevision": 1}), actor
        )
    assert again.draft["values"]["reference"] == f"GMS-MARINE-{year}-001"
