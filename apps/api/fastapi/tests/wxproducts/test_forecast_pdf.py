import json
import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.main import app
from src.wxproducts import advisories, forecast_pdf, presentation, validation
from src.wxproducts.dependencies import ProductAuthor, get_author
from tests.wxproducts.test_authoring import actor as actor
from tests.wxproducts.test_preview import payload
from tests.wxproducts.test_validation import complete

FOUNDATION = (
    Path(__file__).resolve().parents[5] / "packages/gms/src/styles/foundation.css"
)
STRUCTURED = {
    "issuedAt": "2026-09-24T07:00",
    "summary": "Partly cloudy with brief showers.",
    "maxTemperature": "31",
    "minTemperature": "24",
    "windDirFrom": "NE",
    "windDirTo": "E",
    "windSpeedMin": "10",
    "windSpeedMax": "20",
    "windGust": "30",
    "seaStateFrom": "Moderate",
    "waveHeightMin": "1.8",
    "waveHeightMax": "2.7",
    "tide1Type": "Low",
    "tide1Time": "12:30",
    "tide2Type": "High",
    "tide2Time": "05:50",
    "tide2Height": "0.6",
}
ITEM = {
    "source": "Bulletin",
    "title": "Marine",
    "product": "Bulletin",
    "colour": "yellow",
    "likelihood": "Medium",
    "impact": "Minor",
    "impacts": "Choppy seas.",
    "response": "Use caution.",
    "validFrom": "2026-09-24T07:00",
    "validTo": "2026-09-25T07:00",
    "reference": "GMS Marine bulletin r2",
}


def test_palette_mirrors_design_tokens():
    if not FOUNDATION.exists():
        pytest.skip("monorepo design tokens not mounted (API-only container)")
    css = FOUNDATION.read_text()
    for name, hex_value in forecast_pdf.PALETTE.items():
        match = re.search(rf"--gm-{name}:\s*(#[0-9a-fA-F]{{6}})", css)
        assert match, f"--gm-{name} missing from foundation.css"
        assert match.group(1).lower() == hex_value, name


def test_conditions_tiles_follow_units_and_tide_order():
    tiles = presentation.conditions(validation.normalize("morning", STRUCTURED))
    as_text = [(value, label) for _, value, label in tiles]
    assert ("12–23 mph", "Wind speed (10–20 kt)") in as_text
    assert ("35 mph", "Gusts (30 kt)") in as_text
    assert ("NE to E", "Wind direction") in as_text
    assert ("1.8–2.7 m", "Wave height (6–9 ft)") in as_text
    tides = [value for icon, value, _ in tiles if icon.startswith("arrow")]
    assert tides == ["05:50", "12:30"]


def test_conditions_fall_back_to_legacy_free_text():
    tiles = presentation.conditions({"wind": "E 10-15 kt", "seaState": "Slight"})
    assert ("wind", "E 10-15 kt", "Wind") in tiles
    assert ("waves", "Slight", "Sea state") in tiles


def test_matrix_matches_standard_ibf_layout():
    assert forecast_pdf.MATRIX[3] == ["green", "yellow", "orange", "red"]
    assert forecast_pdf.MATRIX[0] == ["green", "green", "yellow", "yellow"]


def test_advisory_validity_is_shown_in_grenada_time():
    item = ITEM | {
        "validFrom": "2026-09-24T12:00:00+00:00",
        "validTo": "2026-09-25T00:00:00+00:00",
    }
    assert forecast_pdf._advisory_valid(item) == "08:00 Thu 24 Sep to 20:00 Thu 24 Sep"
    assert forecast_pdf._advisory_valid({}) == "Until further notice"


@pytest.mark.parametrize(("kind", "pages"), [("morning", 1), ("evening", 2)])
def test_renders_forecast_sheet(kind, pages):
    values = validation.normalize(
        kind,
        complete(kind) | STRUCTURED,
        advisories=json.dumps({"complete": True, "items": [ITEM, ITEM]}),
    )
    options = {"status": "DRAFT PREVIEW — NOT FOR ISSUE", "revision": "preview"}
    document = forecast_pdf.render_forecast_document(kind, values, **options)
    assert len(document.pages) == pages
    assert forecast_pdf.render_forecast_pdf(kind, values, **options).startswith(
        b"%PDF-"
    )


def test_context_escapes_and_marks_matrix():
    values = STRUCTURED | {
        "summary": "<b>not markup</b>",
        "advisories": json.dumps({"complete": False, "items": [ITEM]}),
    }
    context = forecast_pdf.forecast_context(
        "morning", values, status="PUBLISHED ISSUE", revision="r1"
    )
    assert context["status"] == ""
    assert context["complete"] is False
    medium_row = context["matrix"][1]  # rows run from High down to Very low
    assert medium_row[1]["marks"] == [1]
    html = (
        forecast_pdf._environment().get_template("forecast.html.j2").render(**context)
    )
    assert "&lt;b&gt;not markup&lt;/b&gt;" in html


async def test_snapshot_maps_cap_and_bulletins(monkeypatch):
    info = SimpleNamespace(
        language="en-GB",
        event="Heavy rain",
        certainty="Likely",
        severity="Moderate",
        description="Flash flooding possible.",
        instruction="Avoid flooded roads.",
        onset=None,
        effective=None,
        expires=None,
        parameters=[
            SimpleNamespace(value_name="awareness_level", value="3; orange; Severe"),
            SimpleNamespace(value_name="GMS:product", value="Watch"),
        ],
    )
    alert = SimpleNamespace(info=[info], sent=None, identifier="gms-1")

    async def active(**_):
        return SimpleNamespace(data=[alert])

    async def published(*_):
        return [
            SimpleNamespace(
                kind="marine",
                revision=2,
                values={
                    "level": "Yellow",
                    "likelihood": "Medium",
                    "impact": "Minor",
                    "impacts": "Choppy seas.",
                    "response": "Use caution.",
                },
            ),
            SimpleNamespace(kind="morning", revision=1, values={}),
        ]

    monkeypatch.setattr(advisories.cap_service, "public_latest_active", active)
    monkeypatch.setattr(advisories.service, "list_published_products", published)
    data = json.loads(await advisories.snapshot(object(), object()))  # type: ignore[arg-type]
    assert data["complete"] is True
    assert [item["colour"] for item in data["items"]] == ["orange", "yellow"]
    cap, bulletin = data["items"]
    assert cap | {"validFrom": ""} == cap | {
        "title": "Heavy rain",
        "product": "Watch",
        "likelihood": "Medium",
        "impact": "Significant",
        "reference": "CAP gms-1",
    }
    assert bulletin["reference"] == "GMS Marine bulletin r2"


async def test_snapshot_marks_missing_sources_incomplete():
    data = json.loads(await advisories.snapshot(None, None))
    assert data == data | {"complete": False, "items": []}


async def test_preview_pdf_endpoint(async_client, actor, monkeypatch):
    async def author():
        return ProductAuthor(actor, ["morning", "marine"])

    async def no_advisories(*_):
        return json.dumps({"complete": True, "items": []})

    monkeypatch.setattr(advisories, "snapshot", no_advisories)
    app.dependency_overrides[get_author] = author
    try:
        response = await async_client.post(
            "/api/v1/wxproducts/products/preview/pdf",
            json=payload("morning").model_dump(mode="json"),
        )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["cache-control"] == "no-store"
        assert response.content.startswith(b"%PDF-")
        bulletin = await async_client.post(
            "/api/v1/wxproducts/products/preview/pdf",
            json=payload("marine").model_dump(mode="json"),
        )
        assert bulletin.status_code == 200, bulletin.text
        assert bulletin.content.startswith(b"%PDF-")
    finally:
        app.dependency_overrides.pop(get_author, None)


def test_bulletin_sheet_context_and_render():
    values = validation.normalize(
        "marine",
        complete("marine")
        | {
            "level": "Amber",
            "windDirFrom": "E",
            "windSpeedMin": "15",
            "windSpeedMax": "22",
            "visibilityMin": "8",
            "visibilityMax": "12",
            "moonrise": "21:14",
        },
        forecaster="Signed In",
    )
    context = forecast_pdf.bulletin_context(
        "marine", values, status="DRAFT — NOT FOR ISSUE", revision="r1"
    )
    assert values["forecaster"] == "Signed In"
    assert values["wind"] == "E 17–25 mph (15–22 kt)"
    assert context["level_colour"] == "orange"
    assert context["product_code"] == "GMS-BUL-MARINE"
    assert ("Moonrise", "21:14") in context["details"]
    assert all(label != "Wind summary" for label, _ in context["details"])
    assert {
        "icon": "eye",
        "value": "8–12 km (4.3–6.5 nmi), moderate to good",
        "label": "Visibility",
    } in context["tiles"]
    document = forecast_pdf.render_document(
        "marine", values, status="DRAFT — NOT FOR ISSUE", revision="r1"
    )
    assert len(document.pages) == 1


@pytest.mark.parametrize("kind", sorted(forecast_pdf.BULLETIN_NAMES))
def test_every_bulletin_kind_renders(kind):
    values = validation.normalize(kind, complete(kind))
    pdf = forecast_pdf.render_sheet_pdf(kind, values, status="", revision="r1")
    assert pdf.startswith(b"%PDF-")


def test_outlook_sheet_renders_with_its_own_layout():
    values = validation.normalize(
        "outlook", complete("outlook"), forecaster="Signed In"
    )
    context = forecast_pdf.outlook_context(values, status="", revision="r1")
    assert context["product_code"] == "GMS-TWO"
    assert context["forecaster"] == "Signed In"
    document = forecast_pdf.render_document("outlook", values, status="", revision="r1")
    assert len(document.pages) == 1


def test_icons_carry_their_colour_for_weasyprint():
    svg = str(forecast_pdf.icon("wind", "tile-icon", "sky-ink"))
    assert "currentColor" not in svg
    assert forecast_pdf.PALETTE["sky-ink"] in svg
    red = str(forecast_pdf.icon("triangle-alert", "x", forecast_pdf.tone_for("red")))
    assert 'stroke="#ffffff"' in red


def test_saved_revisions_are_archival_pdf_a():
    values = validation.normalize("morning", STRUCTURED)
    options = {"status": "PUBLISHED ISSUE", "revision": "r1"}
    archival = forecast_pdf.render_sheet_pdf(
        "morning", values, archival=True, **options
    )
    preview = forecast_pdf.render_sheet_pdf("morning", values, **options)
    assert archival.startswith(b"%PDF-")
    # PDF/A declares itself in an XMP metadata stream; plain previews omit it.
    assert b"/Metadata" in archival
    assert b"/Metadata" not in preview


@pytest.mark.parametrize(
    ("percent", "expected"),
    [
        (10, ("Low", "yellow")),
        (40, ("Medium", "orange")),
        (60, ("Medium", "orange")),
        (70, ("High", "red")),
    ],
)
def test_outlook_formation_categories(percent, expected):
    assert forecast_pdf.formation_category(percent) == expected


def test_outlook_context_lists_formation_chances():
    values = complete("outlook") | {
        "formationChance48h": "10",
        "formationChance7d": "40",
    }
    chances = forecast_pdf.outlook_context(values, status="", revision="r1")["chances"]
    assert [(c["window"], c["percent"], c["category"]) for c in chances] == [
        ("48 hours", "10%", "Low"),
        ("7 days", "40%", "Medium"),
    ]
