"""Grenada National Climate Bulletin: fields, derived labels, validation, two-page sheet.

Every number and sentence below is invented; real bulletins stay out of the repository.
"""

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import update

from src.main import app
from src.wxproducts import climate, forecast_pdf, pdf, service, validation
from src.wxproducts.dependencies import ProductAuthor, get_author
from src.wxproducts.models import AuthoredProduct
from src.wxproducts.schemas import ProductPdfSourceAdapter, ProductPreviewInputAdapter
from tests.wxproducts.test_authoring import actor as actor
from tests.wxproducts.test_authoring import weather_sessions as weather_sessions
from tests.wxproducts.test_validation import NOW, body, complete


def prose(length: int) -> str:
    """Invented sentences, cut to about `length` characters."""
    sentence = "Invented outlook wording for layout testing, kept plain and neutral. "
    return (sentence * (length // len(sentence) + 1))[:length].strip()


SECTORS = {
    "impactAgriculture": prose(140),
    "impactWater": prose(140),
    "impactHealth": prose(140),
    "impactTourism": prose(130),
    "impactDrm": prose(130),
    "impactEnergy": prose(110),
    "impactFisheries": prose(110),
    "impactInfrastructure": prose(120),
}
# What the examples run to: ENSO and SST about 500 characters, precipitation about 380.
EXAMPLE_LENGTHS = {"enso": 500, "sst": 490, "precipOutlook": 380}


def bulletin(scale: float = 1.0, **changes: str) -> dict[str, str]:
    values = {
        "issuedAt": "2026-10-15T10:00",
        "area": "Grenada, Carriacou and Petite Martinique",
        "volume": "07",
        "issue": "03",
        "month": "2026-09",
        "contacts": "first.contact@example.test\nsecond.contact@example.test",
        **{key: prose(int(n * scale)) for key, n in EXAMPLE_LENGTHS.items()},
        "spi1": "Normal",
        "spi3": "Abnormally Wet",
        "spi6": "Moderately Wet",
        "spi12": "Abnormally Dry",
        "pet": "4.3",
        "petRatio": "1.4",
        "precipRangeMin": "340",
        "precipRangeMax": "410",
        "wetDaysOutlook": "Wet days are expected to be near the usual number.",
        "wetDaysMin": "31",
        "wetDaysMax": "44",
        "wetDaysImplication": prose(int(120 * scale)),
        "wetSpellsOutlook": "Seven-day wet spells are expected near the usual number.",
        "wetSpellsMin": "2",
        "wetSpellsMax": "6",
        "wetSpellsImplication": prose(int(120 * scale)),
        "extremeSpellsOutlook": "Extreme three-day wet spells are expected near the usual number.",
        "extremeSpellsMin": "",
        "extremeSpellsMax": "3",
        "extremeSpellsImplication": prose(int(120 * scale)),
        "tempMeanOutlook": prose(int(180 * scale)),
        "tempMaxOutlook": "Above normal",
        "tempMaxRangeMin": "30.1",
        "tempMaxRangeMax": "30.7",
        "tempMinOutlook": "Above normal",
        "tempMinRangeMin": "24.0",
        "tempMinRangeMax": "24.6",
        "droughtOutlook": prose(int(260 * scale)),
        "forecaster": "Signed In",
        "triviaAnswer": "Last month's invented question? Answer: Atlantic",
        "triviaQuestion": "This month's invented question? a) 27 b) 28 c) 29",
    }
    for key, outlook, low, high, seen in (
        ("verifyRainfall", "Below normal", "310", "395", "288.4"),
        ("verifyWetDays", "Normal", "32", "45", "41"),
        ("verifyWetSpell", "Normal", "1", "5", "2"),
        ("verifyTmax", "Above normal", "30.2", "30.8", "31.1"),
        ("verifyTmin", "Above normal", "24.6", "25.0", "25.7"),
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
# The August layout: min and max paragraphs of about 250 characters each.
TEXT_LAYOUT = {
    "generalImplications": prose(1500),
    "tempMaxOutlook": prose(250),
    "tempMinOutlook": prose(250),
}


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
    assert climate.range_text("340", "410", "mm") == "340 – 410 mm"
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
    assert context["subtitle"] == "Vol 07 / Issue 03"
    assert context["issue_month"] == "October 2026"
    assert context["monitoring_label"] == "September 2026"
    assert context["season_code"] == "OND"
    assert [r["period"] for r in context["spi"]] == [
        "September 2026",
        "July to September 2026",
        "April to September 2026",
        "October 2025 to September 2026",
    ]
    assert context["precip_range"] == "340 – 410 mm"
    assert context["spells"][2]["range"] == "Up to 3"
    assert context["spells"][0]["range"] == "31 – 44"
    assert context["temperature_table"] is True
    assert [row[0] for row in context["temperature_rows"]] == [
        "Daytime temperatures",
        "Night-time temperatures",
        "Potential heat stress",
        "Extreme heat",
    ]
    assert context["temperature_rows"][0][2] == "30.1 – 30.7 °C"
    assert [label for label, _ in context["sectors"]][:3] == [
        "Agriculture",
        "Water",
        "Health",
    ]
    assert context["verification_label"] == "July 2026 – September 2026"
    assert context["verification"][0] == {
        "label": "Rainfall (mm)",
        "outlook": "Below normal",
        "range": "310 – 395",
        "observed": "288.4",
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
def test_the_sheet_is_two_pages_at_the_examples_lengths(layout):
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


def test_only_the_from_end_of_the_extreme_spell_range_is_optional():
    rules = {r.key: r for r in validation.FIELDS["climate-bulletin"]}
    assert not rules["extremeSpellsMin"].requiredOnPublish
    assert rules["extremeSpellsMax"].requiredOnPublish
    assert rules["wetDaysMin"].requiredOnPublish
    values = bulletin(**TEXT_LAYOUT) | {"extremeSpellsMax": ""}
    errors = validation.validate(
        body(
            "climate-bulletin",
            values=validation.normalize("climate-bulletin", values),
            action="publish",
            reviewed=True,
        ),
        now=NOW,
    )
    assert any("Extreme 3-day wet spells" in e and "required" in e for e in errors)


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        (
            {"wetDaysMin": "-1"},
            "Usual number of wet days, from: enter a value from 0 to 10000",
        ),
        (
            {"tempMaxRangeMax": "500"},
            "Normal maximum temperature (°C), to: enter a value from 10 to 45",
        ),
        (
            {"verifyTminObserved": "3"},
            "Tmin (°C), observed: enter a value from 10 to 45",
        ),
        (
            {"verifyRainfallObserved": "-5"},
            "Rainfall (mm), observed: enter a value from 0 to 10000",
        ),
        (
            {"pet": "25"},
            "Potential evapotranspiration (mm/day): enter a value from 0 to 20",
        ),
        (
            {"petRatio": "-0.5"},
            "Atmospheric water demand compared with supply (times): enter a value from 0 to 100",
        ),
        ({"pet": "lots"}, "Potential evapotranspiration (mm/day): enter a number"),
    ],
)
def test_typed_numbers_must_be_plausible(changes, message):
    values = validation.normalize("climate-bulletin", bulletin(**changes))
    errors = validation.validate(
        body("climate-bulletin", values=values, action="draft"), now=NOW
    )
    assert message in errors


def test_ordinary_numbers_pass_the_bounds():
    values = validation.normalize("climate-bulletin", bulletin(**TEXT_LAYOUT))
    errors = validation.validate(
        body("climate-bulletin", values=values, action="draft"), now=NOW
    )
    assert not [e for e in errors if "enter a value" in e or "enter a number" in e]


def test_for_example_in_long_text_does_not_block_publishing():
    values = bulletin(**TEXT_LAYOUT) | {
        "enso": "Impacts such as heat, for example, may rise."
    }
    errors = validation.validate(
        body(
            "climate-bulletin",
            values=validation.normalize("climate-bulletin", values),
            action="publish",
            reviewed=True,
        ),
        now=NOW,
    )
    assert "Replace example draft wording before publishing" not in errors
    # A short identifier-like field still catches placeholder wording.
    short = values | {"heatStress": "Example draft"}
    errors = validation.validate(
        body(
            "climate-bulletin",
            values=validation.normalize("climate-bulletin", short),
            action="publish",
            reviewed=True,
        ),
        now=NOW,
    )
    assert "Replace example draft wording before publishing" in errors


def test_the_temperature_table_names_the_season_and_its_years():
    nov = validation.normalize(
        "climate-bulletin",
        bulletin(issuedAt="2026-11-15T10:00", month="2026-10", **TABLE_LAYOUT),
    )
    context = forecast_pdf.climate_bulletin_context(nov, status="", revision="r1")
    assert context["season_code"] == "NDJ"
    assert context["season_year"] == "2026-27"
    html = forecast_pdf._environment().get_template("climate.html.j2").render(**context)
    assert "NDJ 2026-27 outlook" in html
    oct_values = validation.normalize("climate-bulletin", bulletin(**TABLE_LAYOUT))
    context = forecast_pdf.climate_bulletin_context(
        oct_values, status="", revision="r1"
    )
    assert context["season_year"] == "2026"
    unknown = forecast_pdf.climate_bulletin_context(
        dict(oct_values) | {"issuedAt": ""}, status="", revision="r1"
    )
    html = forecast_pdf._environment().get_template("climate.html.j2").render(**unknown)
    assert "<th>Outlook</th>" in html


def test_a_sheet_past_its_designed_page_count_is_flagged():
    assert forecast_pdf.sheet_warning("climate-bulletin", 2) == ""
    assert "runs to 3 pages" in forecast_pdf.sheet_warning("climate-bulletin", 3)
    assert forecast_pdf.sheet_warning("morning", 5) == ""


def test_page_one_text_20_percent_longer_gives_two_pages_or_a_warning():
    values = validation.normalize(
        "climate-bulletin", bulletin(scale=1.2, **TEXT_LAYOUT)
    )
    sheet = forecast_pdf.render_sheet(
        "climate-bulletin", values, status="", revision="r1"
    )
    assert sheet.pages == 2 or forecast_pdf.sheet_warning(
        "climate-bulletin", sheet.pages
    )


async def test_preview_pdf_reports_pages_and_warns_when_the_sheet_overflows(
    async_client, actor
):
    def preview(values):
        return ProductPreviewInputAdapter.validate_python(
            {
                "kind": "climate-bulletin",
                "values": values,
                "expectedRevision": 0,
                "changeSummary": "",
            }
        ).model_dump(mode="json")

    app.dependency_overrides[get_author] = lambda: ProductAuthor(
        actor, ["climate-bulletin"]
    )
    try:
        normal = await async_client.post(
            "/api/v1/wxproducts/products/preview/pdf",
            json=preview(bulletin(**TEXT_LAYOUT)),
        )
        assert normal.status_code == 200, normal.text
        assert normal.headers["x-sheet-pages"] == "2"
        assert "x-sheet-warning" not in normal.headers
        overflowing = await async_client.post(
            "/api/v1/wxproducts/products/preview/pdf",
            json=preview(bulletin(scale=4, **TEXT_LAYOUT)),
        )
        assert overflowing.status_code == 200, overflowing.text
        assert int(overflowing.headers["x-sheet-pages"]) > 2
        assert "designed for 2" in overflowing.headers["x-sheet-warning"]
    finally:
        app.dependency_overrides.pop(get_author, None)


LEGACY = {
    "summary": "Earlier-format summary.",
    "rainfallComment": "Earlier rainfall note.",
    "temperatureComment": "Earlier temperature note.",
    "notableEvents": "Earlier events note.",
    "outlook": "Earlier outlook note.",
}


def test_normalize_drops_only_the_legacy_climate_keys():
    values = validation.normalize("climate-bulletin", bulletin() | LEGACY | {"x": "1"})
    assert not set(LEGACY) & set(values)
    assert values["x"] == "1"  # any other unknown key is still refused later
    assert validation.normalize("morning", {"summary": "kept"})["summary"] == "kept"


def _issued_recently(**changes):
    now = datetime.now(validation.GRENADA) - timedelta(hours=1)
    return (
        bulletin(
            issuedAt=now.strftime("%Y-%m-%dT%H:%M"),
            month=validation.previous_month(now.date()),
            **TEXT_LAYOUT,
        )
        | changes
    )


@pytest.mark.parametrize("action", ["draft", "publish"])
async def test_legacy_keyed_climate_values_can_be_saved_and_published(
    weather_sessions, actor, action
):
    payload = body(
        "climate-bulletin", values=_issued_recently() | LEGACY, action=action
    )
    async with weather_sessions() as session:
        saved = await service.write_product(session, payload, actor)
        assert saved.revision == 1
        assert not set(LEGACY) & set(saved.draft["values"])


async def test_published_legacy_climate_revision_can_be_withdrawn(
    weather_sessions, actor
):
    payload = body("climate-bulletin", values=_issued_recently(), action="publish")
    async with weather_sessions() as session:
        await service.write_product(session, payload, actor)
    async with weather_sessions() as session, session.begin():
        row = await session.get(AuthoredProduct, payload.id)
        assert row is not None
        draft = {**row.draft, "values": {**row.draft["values"], **LEGACY}}
        published = {**row.published, "values": {**row.published["values"], **LEGACY}}
        await session.execute(
            update(AuthoredProduct)
            .where(AuthoredProduct.id == payload.id)
            .values(draft=draft, published=published)
        )
    withdraw = payload.model_copy(
        update={
            "action": "withdraw",
            "expectedRevision": 1,
            "changeSummary": "Withdraw old issue",
            "values": payload.values | LEGACY,
        }
    )
    async with weather_sessions() as session:
        withdrawn = await service.write_product(session, withdraw, actor)
        assert withdrawn.published is None
        assert withdrawn.draft["values"]["summary"] == LEGACY["summary"]
