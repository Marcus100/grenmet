"""Marine Forecast is a forecast (imports advisories); marine and climate have PDFs."""

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.exceptions import AppException
from src.main import app
from src.wxproducts import advisories, forecast_pdf, pdf, service, validation
from src.wxproducts.dependencies import ProductAuthor, get_author
from src.wxproducts.exceptions import UnsupportedSheetKind
from src.wxproducts.schemas import ProductPdfSourceAdapter
from tests.wxproducts.test_authoring import actor as actor
from tests.wxproducts.test_authoring import weather_sessions as weather_sessions
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
    forged = validation.validate(
        body(
            "marine-forecast",
            values=values | {"forged": "yes"},
            action="publish",
            reviewed=True,
        ),
        now=NOW,
    )
    assert forged == ["Unknown product field"]


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


def test_climate_sheet_uses_the_current_fields_only():
    values = validation.normalize(
        "climate-bulletin",
        complete("climate-bulletin")
        | {
            "issuedAt": "2026-11-15T10:00",
            "month": "2026-10",
            "rainfallComment": "Wetter than normal.",
            "temperatureComment": "Warm nights.",
            "notableEvents": "Tropical wave on the 12th.",
            "outlook": "Drier into December.",
        },
        forecaster="Signed In",
    )
    context = forecast_pdf.climate_bulletin_context(values, status="", revision="r1")
    assert context["title"] == "Climate Bulletin"
    assert context["subtitle"] == "October 2026"
    sections = dict(context["sections"])
    assert sections["Rainfall"] == "Wetter than normal."
    assert sections["Outlook for the coming months"] == "Drier into December."
    assert "Month reviewed" not in sections


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


LEGACY = {"smallCraft": "Small craft advisory", "smallCraftNotes": "Stay in port."}


def current_marine(**changes):
    """A marine forecast issued today (Grenada) that is valid now."""
    today = datetime.now(validation.GRENADA).date().isoformat()
    values = complete("marine-forecast") | MARINE | {"issuedAt": f"{today}T05:00"}
    return body("marine-forecast", values=values, **changes)


def test_normalize_drops_only_the_legacy_small_craft_keys():
    values = validation.normalize(
        "marine-forecast", complete("marine-forecast") | LEGACY
    )
    assert not set(LEGACY) & set(values)
    # Any other unknown key still reaches the unknown-field check.
    other = validation.normalize(
        "marine-forecast", complete("marine-forecast") | {"x": "1"}
    )
    assert other["x"] == "1"
    # Other kinds are untouched.
    assert (
        validation.normalize("morning", {"smallCraft": "kept"})["smallCraft"] == "kept"
    )


@pytest.mark.parametrize("action", ["draft", "publish"])
async def test_legacy_revision_values_can_be_saved_and_published(
    weather_sessions, actor, action
):
    payload = current_marine(action=action, changeSummary="")
    payload.values.update(LEGACY)
    async with weather_sessions() as session:
        saved = await service.write_product(session, payload, actor)
        assert saved.revision == 1
        assert not set(LEGACY) & set(saved.draft["values"])


async def test_published_legacy_revision_can_be_withdrawn(weather_sessions, actor):
    from sqlalchemy import update

    from src.wxproducts.models import AuthoredProduct

    payload = current_marine(action="publish")
    async with weather_sessions() as session:
        await service.write_product(session, payload, actor)
    # Give the stored revision the keys an older issue carried.
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
    # The desk posts the stored values back, hidden legacy keys included.
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
        assert withdrawn.draft["values"]["smallCraft"] == LEGACY["smallCraft"]


def _marine_html(values):
    context = forecast_pdf.marine_forecast_context(values, status="", revision="r1")
    return forecast_pdf._environment().get_template("marine.html.j2").render(**context)


def test_marine_sheet_never_claims_none_in_force_without_a_snapshot():
    base = complete("marine-forecast") | MARINE
    # Revision saved before alerts were captured.
    html = _marine_html(base | {"advisories": ""})
    assert "Alerts were not captured for this revision." in html
    assert "were in force at issue" not in html
    # Snapshot taken, nothing in force.
    html = _marine_html(
        base | {"advisories": json.dumps({"complete": True, "items": []})}
    )
    assert "No CAP alerts or GMS bulletins were in force at issue." in html
    assert "not captured" not in html
    # Snapshot taken but a source was unreadable: no "none in force" claim.
    html = _marine_html(
        base | {"advisories": json.dumps({"complete": False, "items": []})}
    )
    assert "were in force at issue" not in html
    assert "Some warning sources were unavailable at issue" in html
    # Normal snapshot with an item.
    html = _marine_html(base | {"advisories": SNAPSHOT})
    assert ITEM["title"] in html
    assert "not captured" not in html


def test_marine_sheet_shows_legacy_small_craft_as_recorded():
    html = _marine_html(complete("marine-forecast") | MARINE | LEGACY)
    assert "Small craft (as recorded)" in html
    assert "Small craft advisory" in html
    assert "Stay in port." in html
    assert "Small craft (as recorded)" not in _marine_html(
        complete("marine-forecast") | MARINE
    )


def test_land_sheet_without_a_snapshot_is_not_a_false_negative():
    def html(values):
        context = forecast_pdf.forecast_context(
            "morning", values, status="", revision="r1"
        )
        return (
            forecast_pdf._environment()
            .get_template("forecast.html.j2")
            .render(**context)
        )

    assert "Alerts were not captured for this revision." in html({})
    captured = html({"advisories": json.dumps({"complete": True, "items": []})})
    assert "No CAP alerts or GMS bulletins were in force at issue." in captured


def test_a_cap_text_containing_example_does_not_block_publishing():
    values = validation.normalize(
        "marine-forecast",
        complete("marine-forecast"),
        advisories=json.dumps(
            {"complete": True, "items": [ITEM | {"impacts": "See example.org"}]}
        ),
    )
    errors = validation.validate(
        body("marine-forecast", values=values, action="publish", reviewed=True), now=NOW
    )
    assert "Replace example draft wording before publishing" not in errors


async def test_revision_pdf_route_returns_422_for_a_kind_without_a_layout(
    async_client, weather_sessions, actor, monkeypatch
):
    payload = current_marine(action="publish")
    async with weather_sessions() as session:
        await service.write_product(session, payload, actor)
    monkeypatch.setattr(forecast_pdf, "SHEET_KINDS", frozenset())
    app.dependency_overrides[get_author] = lambda: ProductAuthor(
        actor, ["marine-forecast"]
    )
    try:
        response = await async_client.get(
            f"/api/v1/wxproducts/products/{payload.id}/revisions/1/pdf"
        )
    finally:
        app.dependency_overrides.pop(get_author, None)
    assert response.status_code == 422, response.text
    assert "No PDF layout exists" in response.json()["detail"]
