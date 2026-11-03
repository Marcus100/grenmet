"""Marine Forecast is a forecast (imports advisories); marine and climate have PDFs."""

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.exceptions import AppException
from src.main import app
from src.wxproducts import advisories, forecast_pdf, pdf, validation
from src.wxproducts.dependencies import ProductAuthor, get_author
from src.wxproducts.exceptions import UnsupportedSheetKind
from src.wxproducts.schemas import ProductPdfSourceAdapter
from tests.wxproducts.test_authoring import actor as actor
from tests.wxproducts.test_forecast_pdf import ITEM
from tests.wxproducts.test_preview import payload
from tests.wxproducts.test_validation import NOW, body, complete

SNAPSHOT = json.dumps({"complete": True, "items": [ITEM]})
MARINE = {
    "synopsis": "A ridge north of the islands keeps the trades fresh.",
    "outlook": "Seas stay moderate through tomorrow.",
    "windDirFrom": "E",
    "windDirTo": "ENE",
    "windSpeedMin": "15",
    "windSpeedMax": "22",
    "windGust": "28",
    "seaStateFrom": "Moderate",
    "waveHeightMin": "1.5",
    "waveHeightMax": "2.5",
    "swellDir": "NE",
    "swellPeriod": "9",
    "swellHeight": "1.8",
}


def test_marine_forecast_imports_advisories_like_the_other_forecasts():
    assert "marine-forecast" in validation.ADVISORY_KINDS
    assert set(validation.ISSUE_HOURS) <= validation.ADVISORY_KINDS
    assert "marine" not in validation.ADVISORY_KINDS
    values = validation.normalize(
        "marine-forecast", complete("marine-forecast"), advisories=SNAPSHOT
    )
    assert values["advisories"] == SNAPSHOT
    assert validation.normalize("marine-forecast", complete("marine-forecast")).get(
        "advisories"
    ) in (None, "")


def test_typed_small_craft_choice_is_gone_and_not_required():
    keys = {rule.key for rule in validation.FIELDS["marine-forecast"]}
    assert not keys & {"smallCraft", "smallCraftNotes"}
    assert "advisories" in keys
    values = complete("marine-forecast")
    assert "smallCraft" not in values
    errors = validation.validate(
        body("marine-forecast", values=values, action="publish", reviewed=True),
        now=NOW,
    )
    assert errors == []
    typed = validation.validate(
        body(
            "marine-forecast",
            values=values | {"smallCraft": "Small craft advisory"},
            action="publish",
            reviewed=True,
        ),
        now=NOW,
    )
    assert typed == ["Unknown product field"]


def test_preview_carries_the_advisories_snapshot():
    result = validation.preview(
        payload("marine-forecast"), now=NOW, advisories=SNAPSHOT
    )
    assert result.values["advisories"] == SNAPSHOT


@pytest.mark.parametrize("kind", ["marine-forecast", "climate-bulletin"])
def test_sheet_kinds_cover_marine_forecast_and_climate(kind):
    assert kind in forecast_pdf.SHEET_KINDS


@pytest.mark.parametrize("kind", ["marine-forecast", "climate-bulletin"])
def test_each_new_kind_renders_a_pdf(kind):
    values = validation.normalize(
        kind, complete(kind) | (MARINE if "marine" in kind else {})
    )
    result = forecast_pdf.render_sheet_pdf(kind, values, status="", revision="r1")
    assert result.startswith(b"%PDF-")
    archival = forecast_pdf.render_sheet_pdf(
        kind, values, status="", revision="r1", archival=True
    )
    assert archival.startswith(b"%PDF-")


def test_marine_sheet_shows_synopsis_winds_seas_advisories_and_outlook():
    values = validation.normalize(
        "marine-forecast",
        complete("marine-forecast") | MARINE,
        forecaster="Signed In",
        advisories=SNAPSHOT,
    )
    context = forecast_pdf.marine_forecast_context(
        values, status="PUBLISHED ISSUE", revision="r1"
    )
    assert context["title"] == "Marine Forecast"
    assert context["product_code"] == "GMS-MWF-MARINE"
    assert context["next_update"] == "05:00 AST"
    assert context["synopsis"] == MARINE["synopsis"]
    assert context["outlook"] == MARINE["outlook"]
    winds = {tile["label"]: tile["value"] for tile in context["wind_tiles"]}
    seas = {tile["label"]: tile["value"] for tile in context["sea_tiles"]}
    assert winds["Wind speed"] == "17–25 mph"
    assert winds["Gusts"] == "32 mph"
    assert winds["Wind direction"] == "E to ENE"
    assert seas["Wave height"] == "5–8 ft"
    assert "Wave height" not in winds
    assert [item["title"] for item in context["advisories"]] == [ITEM["title"]]
    html = forecast_pdf._environment().get_template("marine.html.j2").render(**context)
    for text in (
        MARINE["synopsis"],
        MARINE["outlook"],
        "Alerts and advisories in force",
        "Waters of Grenada, Carriacou and Petite Martinique",
    ):
        assert text in html
    assert "Small craft advice" not in html


def test_marine_sheet_says_when_no_advisories_were_in_force():
    values = validation.normalize(
        "marine-forecast",
        complete("marine-forecast") | MARINE,
        advisories=json.dumps({"complete": True, "items": []}),
    )
    context = forecast_pdf.marine_forecast_context(values, status="", revision="r1")
    html = forecast_pdf._environment().get_template("marine.html.j2").render(**context)
    assert "No CAP alerts or GMS bulletins were in force at issue." in html


def test_older_marine_revision_with_small_craft_fields_still_renders():
    source = ProductPdfSourceAdapter.validate_python(
        {
            "product_id": uuid4(),
            "revision": 1,
            "kind": "marine-forecast",
            "values": complete("marine-forecast")
            | MARINE
            | {
                "smallCraft": "Small craft advisory",
                "smallCraftNotes": "Stay in port.",
            },
            "action": "publish",
            "recorded_at": datetime.now(UTC),
            "current_publication": True,
        }
    )
    assert pdf.render_product_pdf(source).startswith(b"%PDF-")


def test_unknown_kind_raises_a_typed_error_not_a_key_error():
    with pytest.raises(UnsupportedSheetKind) as raised:
        forecast_pdf.render_sheet_pdf("aviation", {}, status="", revision="r1")
    assert isinstance(raised.value, AppException)
    assert raised.value.status_code == 422
    with pytest.raises(UnsupportedSheetKind):
        forecast_pdf.render_document("nonsense", {}, status="", revision="r1")


async def test_preview_pdf_endpoint_for_marine_forecast_and_climate(
    async_client, actor, monkeypatch
):
    seen = []

    async def snapshot(*_):
        seen.append(True)
        return SNAPSHOT

    monkeypatch.setattr(advisories, "snapshot", snapshot)
    app.dependency_overrides[get_author] = lambda: ProductAuthor(
        actor, ["marine-forecast", "climate-bulletin"]
    )
    try:
        for kind in ("marine-forecast", "climate-bulletin"):
            response = await async_client.post(
                "/api/v1/wxproducts/products/preview/pdf",
                json=payload(kind).model_dump(mode="json"),
            )
            assert response.status_code == 200, response.text
            assert response.content.startswith(b"%PDF-")
        assert len(seen) == 1  # only Marine Forecast imports advisories
        preview = await async_client.post(
            "/api/v1/wxproducts/products/preview",
            json=payload("marine-forecast").model_dump(mode="json"),
        )
        assert preview.status_code == 200, preview.text
        assert preview.json()["values"]["advisories"] == SNAPSHOT
        assert len(seen) == 2
    finally:
        app.dependency_overrides.pop(get_author, None)
