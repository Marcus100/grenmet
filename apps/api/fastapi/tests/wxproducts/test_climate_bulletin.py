"""Grenada National Climate Bulletin: fields, derived labels, validation, two-page sheet.

The text below is made up; real bulletins stay out of the repository.
"""

from datetime import UTC, date, datetime
from uuid import uuid4

import pytest

from src.wxproducts import climate, forecast_pdf, pdf, validation
from src.wxproducts.schemas import ProductPdfSourceAdapter
from tests.wxproducts.test_validation import NOW, body, complete

LONG = (
    "Made-up outlook wording that fills a paragraph so the layout is tested "
    "with realistic length. " * 3
).strip()

SECTORS = {
    "impactAgriculture": "Made-up sector text for agriculture. " * 2,
    "impactWater": "Made-up sector text for water. " * 2,
    "impactHealth": "Made-up sector text for health. " * 2,
    "impactTourism": "Made-up sector text for tourism. " * 2,
    "impactDrm": "Made-up sector text for disaster risk management. " * 2,
    "impactEnergy": "Made-up sector text for energy. " * 2,
    "impactFisheries": "Made-up sector text for fisheries. " * 2,
    "impactInfrastructure": "Made-up sector text for infrastructure. " * 2,
}


def bulletin(**changes: str) -> dict[str, str]:
    values = {
        "issuedAt": "2026-10-15T10:00",
        "volume": "09",
        "issue": "10",
        "month": "2026-09",
        "contacts": "first.contact@example.test\nsecond.contact@example.test",
        "enso": LONG,
        "sst": LONG,
        "spi1": "Abnormally Dry",
        "spi3": "Moderately Dry",
        "spi6": "Severely Dry",
        "spi12": "Exceptionally Dry",
        "pet": "5.7",
        "petRatio": "1.7",
        "precipOutlook": LONG,
        "precipRangeMin": "363",
        "precipRangeMax": "436",
        "wetDaysOutlook": "Normal number of wet days is expected.",
        "wetDaysMin": "33",
        "wetDaysMax": "47",
        "wetDaysImplication": LONG,
        "wetSpellsOutlook": "Normal number of 7-day wet spells.",
        "wetSpellsMin": "3",
        "wetSpellsMax": "7",
        "wetSpellsImplication": LONG,
        "extremeSpellsOutlook": "Normal number of extreme 3-day wet spells.",
        "extremeSpellsMin": "",
        "extremeSpellsMax": "2",
        "extremeSpellsImplication": LONG,
        "tempMeanOutlook": LONG,
        "tempMaxOutlook": "Above normal",
        "tempMaxRangeMin": "30.4",
        "tempMaxRangeMax": "30.9",
        "tempMinOutlook": "Above normal",
        "tempMinRangeMin": "24.2",
        "tempMinRangeMax": "24.9",
        "droughtOutlook": LONG,
        "forecaster": "Signed In",
        "triviaAnswer": "Last month's made-up question? Answer: 2023",
        "triviaQuestion": "This month's made-up question? a) 25.5 b) 26.5 c) 27.5",
    }
    for key, outlook, low, high, seen in (
        ("verifyRainfall", "Normal to Below normal", "373", "428", "303.3"),
        ("verifyWetDays", "Normal to Below normal", "35", "48", "38"),
        ("verifyWetSpell", "Normal to below normal", "2", "7", "0"),
        ("verifyTmax", "Above normal", "30.3", "31.2", "31.7"),
        ("verifyTmin", "Above normal", "24.9", "25.3", "26.3"),
    ):
        values |= {
            f"{key}Outlook": outlook,
            f"{key}RangeMin": low,
            f"{key}RangeMax": high,
            f"{key}Observed": seen,
        }
    return values | changes


TABLE_LAYOUT = {
    "heatStress": "Moderate",
    "extremeHeat": "Possible in hot spells",
} | SECTORS
TEXT_LAYOUT = {"generalImplications": LONG * 3}


def test_window_labels_follow_the_month_reviewed():
    assert climate.window_label("2026-09", 1) == "September 2026"
    assert climate.window_label("2026-09", 3) == "July to September 2026"
    assert climate.window_label("2026-09", 6) == "April to September 2026"
    assert climate.window_label("2026-09", 12) == "October 2025 to September 2026"
    assert climate.window_label("2026-02", 3) == "December 2025 to February 2026"
    assert climate.window_label("nonsense", 3) == ""
    assert climate.verification_label("2026-09") == "July 2026 – September 2026"


@pytest.mark.parametrize(
    ("issued", "code", "label"),
    [
        (date(2026, 10, 15), "OND", "October to December 2026"),
        (date(2026, 8, 15), "ASO", "August to October 2026"),
        (date(2026, 9, 15), "SON", "September to November 2026"),
        (date(2026, 11, 15), "NDJ", "November 2026 to January 2027"),
    ],
)
def test_season_starts_in_the_issue_month(issued, code, label):
    assert climate.season(issued) == (code, label)


def test_range_text():
    assert climate.range_text("373", "428", "mm") == "373 – 428 mm"
    assert climate.range_text("", "2", up_to_when_zero=True) == "Up to 2"
    assert climate.range_text("0", "2", up_to_when_zero=True) == "Up to 2"
    assert climate.range_text("0", "5") == "0 – 5"
    assert climate.range_text("", "") == "—"


def test_spi_categories_match_the_editor_options():
    rule = next(r for r in validation.FIELDS["climate-bulletin"] if r.key == "spi1")
    assert tuple(rule.options or ()) == climate.SPI_CATEGORIES


def test_required_fields_and_optional_parts():
    rules = {r.key: r for r in validation.FIELDS["climate-bulletin"]}
    for key in (
        "volume",
        "issue",
        "month",
        "enso",
        "sst",
        "spi12",
        "pet",
        "droughtOutlook",
    ):
        assert rules[key].requiredOnPublish, key
    for key in (
        "heatStress",
        "extremeHeat",
        "generalImplications",
        "contacts",
        "impactWater",
        "triviaQuestion",
    ):
        assert not rules[key].requiredOnPublish, key
    assert not {"summary", "rainfallComment", "notableEvents"} & set(rules)


@pytest.mark.parametrize("layout", [TABLE_LAYOUT, TEXT_LAYOUT], ids=["table", "text"])
def test_both_layouts_validate_for_publication(layout):
    values = validation.normalize("climate-bulletin", bulletin(**layout))
    errors = validation.validate(
        body("climate-bulletin", values=values, action="publish", reviewed=True),
        now=NOW,
    )
    assert [e for e in errors if "Month reviewed" in e or "range" in e.lower()] == []
    assert not [e for e in errors if "Implications" in e]


def test_publishing_needs_implications_and_sane_ranges():
    values = validation.normalize("climate-bulletin", bulletin())
    errors = validation.validate(
        body("climate-bulletin", values=values, action="publish", reviewed=True),
        now=NOW,
    )
    assert (
        "Implications: fill in the sector table or the general implications" in errors
    )
    draft = validation.validate(
        body("climate-bulletin", values=values, action="draft"), now=NOW
    )
    assert (
        "Implications: fill in the sector table or the general implications"
        not in draft
    )
    backwards = validation.normalize(
        "climate-bulletin",
        bulletin(
            wetDaysMin="60",
            wetDaysMax="40",
            verifyTmaxRangeMin="32",
            verifyTmaxRangeMax="30",
        ),
    )
    found = validation.validate(
        body("climate-bulletin", values=backwards, action="draft"), now=NOW
    )
    assert "Usual number of wet days: 'from' exceeds 'to'" in found
    assert "Tmax, normal range: 'from' exceeds 'to'" in found


def test_unknown_spi_category_is_refused():
    values = validation.normalize("climate-bulletin", bulletin(spi1="Quite damp"))
    errors = validation.validate(
        body("climate-bulletin", values=values, action="draft"), now=NOW
    )
    assert "SPI, month reviewed: select a listed option" in errors


def test_sheet_context_derives_labels_and_tables():
    values = validation.normalize("climate-bulletin", bulletin(**TABLE_LAYOUT))
    context = forecast_pdf.climate_bulletin_context(values, status="", revision="r1")
    assert context["title"] == "Grenada National Climate Bulletin"
    assert context["subtitle"] == "Vol 09 / Issue 10"
    assert context["issue_month"] == "October 2026"
    assert context["monitoring_label"] == "September 2026"
    assert context["season_code"] == "OND"
    assert [r["period"] for r in context["spi"]] == [
        "September 2026",
        "July to September 2026",
        "April to September 2026",
        "October 2025 to September 2026",
    ]
    assert context["precip_range"] == "363 – 436 mm"
    assert context["spells"][2]["range"] == "Up to 2"
    assert context["spells"][0]["range"] == "33 – 47"
    assert context["temperature_table"] is True
    assert [row[0] for row in context["temperature_rows"]] == [
        "Daytime temperatures",
        "Night-time temperatures",
        "Potential heat stress",
        "Extreme heat",
    ]
    assert context["temperature_rows"][0][2] == "30.4 – 30.9 °C"
    assert [label for label, _ in context["sectors"]][:3] == [
        "Agriculture",
        "Water",
        "Health",
    ]
    assert context["verification_label"] == "July 2026 – September 2026"
    assert context["verification"][0] == {
        "label": "Rainfall (mm)",
        "outlook": "Normal to Below normal",
        "range": "373 – 428",
        "observed": "303.3",
    }
    assert context["contacts"] == [
        "first.contact@example.test",
        "second.contact@example.test",
    ]


def test_text_layout_omits_the_unused_parts():
    values = validation.normalize("climate-bulletin", bulletin(**TEXT_LAYOUT))
    context = forecast_pdf.climate_bulletin_context(values, status="", revision="r1")
    assert context["temperature_table"] is False
    assert context["sectors"] == []
    html = forecast_pdf._environment().get_template("climate.html.j2").render(**context)
    assert "General implications" in html
    assert "Potential climate implications" not in html
    assert "Normal range for minimum temperature (OND)" in html
    assert "Disclaimer:" in html
    assert "to be added" in html  # map placeholders


@pytest.mark.parametrize("layout", [TABLE_LAYOUT, TEXT_LAYOUT], ids=["table", "text"])
def test_the_sheet_is_two_pages(layout):
    values = validation.normalize("climate-bulletin", bulletin(**layout))
    document = forecast_pdf.render_document(
        "climate-bulletin", values, status="PUBLISHED ISSUE", revision="r1"
    )
    assert len(document.pages) == 2


def test_older_climate_revision_still_renders():
    old = {
        "issuedAt": "2026-09-15T10:00",
        "validFrom": "2026-09-15T10:00",
        "validTo": "2026-10-15T23:59",
        "month": "2026-08",
        "summary": "Earlier-format summary text.",
        "rainfallComment": "Earlier rainfall note.",
        "outlook": "Earlier outlook note.",
        "forecaster": "Signed In",
    }
    source = ProductPdfSourceAdapter.validate_python(
        {
            "product_id": uuid4(),
            "revision": 1,
            "kind": "climate-bulletin",
            "values": old,
            "action": "publish",
            "recorded_at": datetime.now(UTC),
            "current_publication": True,
        }
    )
    context = forecast_pdf.climate_bulletin_context(old, status="", revision="r1")
    assert ("Rainfall", "Earlier rainfall note.") in context["legacy"]
    assert pdf.render_product_pdf(source).startswith(b"%PDF-")


def test_complete_helper_still_builds_a_valid_draft():
    assert complete("climate-bulletin")["issuedAt"]
