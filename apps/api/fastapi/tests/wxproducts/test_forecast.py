from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text

from src.main import app
from src.wxproducts import forecast
from src.wxproducts.dependencies import get_session
from src.wxproducts.schemas import PublishedProduct
from src.wxproducts.validation import ISSUE_HOURS, local_time
from tests.wxproducts.test_public_products import insert_product
from tests.wxproducts.test_public_products import weather_db as weather_db


def publication(kind="morning", day="2026-09-14", revision=1):
    values = {
        "issuedAt": f"{day}T{ISSUE_HOURS[kind]:02}:00",
        "summary": kind,
        "maxTemperature": "" if kind == "evening" else "31.5",
        "minTemperature": "25",
        "observedTemperature": "25.9" if kind == "midday" else "",
        "forecaster": "PRIVATE FORECASTER",
        "wind": "ENE",
        "highTides": "09:15",
    }
    for index in range(1, 5):
        values.update(
            {
                f"day{index}Weather": f"Weather day {index}",
                f"day{index}Max": "32",
                f"day{index}Min": "25",
                f"day{index}Wind": "E",
            }
        )
    return PublishedProduct(
        id=uuid4(),
        kind=kind,
        revision=revision,
        publishedAt=f"{day}T10:00:00Z",
        values=values,
    )


def at(time, products=None):
    if products is None:
        products = [publication(kind) for kind in ISSUE_HOURS]
    return forecast.select_forecast(products, local_time(time))


@pytest.mark.parametrize(
    ("time", "kind"),
    [
        ("2026-09-14T07:00", "morning"),
        ("2026-09-14T11:59", "morning"),
        ("2026-09-14T12:00", "midday"),
        ("2026-09-14T17:59", "midday"),
        ("2026-09-14T18:00", "evening"),
        ("2026-09-15T00:00", "evening"),
        ("2026-09-15T06:59", "evening"),
        ("2026-09-15T07:00", None),
    ],
)
def test_selection_boundaries(time, kind):
    result = at(time)
    selected = result.periods[0]
    assert (selected.source.kind if selected.source else None) == kind
    assert len(result.periods) == 5
    assert selected.valid_to.hour == 11  # serialized schema normalizes to UTC


def test_late_publications_and_midnight():
    assert at("2026-09-14T13:00", [publication()]).periods[0].source.kind == "morning"
    assert (
        at("2026-09-14T19:00", [publication("midday")]).periods[0].source.kind
        == "midday"
    )
    assert at("2026-09-15T02:00").base_date == "2026-09-14"
    morning = at("2026-09-15T07:00")
    assert morning.base_date == "2026-09-15" and morning.periods[0].source is None
    assert morning.periods[1].details["summary"] == "Weather day 2"


def test_outlook_rollover_revision_and_observation():
    reports = [publication("evening", "2026-09-13"), publication("evening")]
    assert (
        at("2026-09-14T12:00", reports).periods[1].details["summary"] == "Weather day 2"
    )
    assert (
        at("2026-09-14T18:00", reports).periods[1].details["summary"] == "Weather day 1"
    )
    newer = publication("midday", revision=2)
    newer.values["summary"] = "Updated"
    result = at("2026-09-14T13:00", [publication("midday"), newer])
    assert result.periods[0].source.product_id == newer.id
    assert result.periods[0].source.revision == 2
    assert result.periods[0].high == 31.5
    assert result.observation.temperature == 25.9
    assert result.observation.time_basis == "product_issue"
    assert "PRIVATE" not in result.model_dump_json()


def test_future_expiry_and_year_rollover():
    future = publication()
    future.publishedAt = "2026-09-14T18:00:00Z"
    assert at("2026-09-14T08:00", [future]).periods[0].source is None
    assert all(p.source is None for p in at("2026-09-19T07:00").periods)
    result = at("2026-12-30T18:00", [publication("evening", "2026-12-30")])
    assert result.periods[-1].date == "2027-01-03"
    for period in result.periods[1:]:
        assert period.valid_to - period.valid_from == timedelta(days=1)
    assert result.periods[0].high is None


async def test_public_endpoint_privacy_withdrawal_and_outage(
    async_client, weather_db, monkeypatch
):
    await insert_product(weather_db, publication())
    await insert_product(weather_db, publication("midday"), published=False)
    original = forecast.load_forecast

    async def fixed_clock(session, _now):
        return await original(session, local_time("2026-09-14T13:00"))

    monkeypatch.setattr(forecast, "load_forecast", fixed_clock)

    async def override():
        yield weather_db

    app.dependency_overrides[get_session] = override
    url = "/api/v1/wxproducts/public/forecast"
    try:
        result = await async_client.get(url)
        assert result.status_code == 200, result.text
        assert result.headers["cache-control"] == "no-store"
        assert result.json()["periods"][0]["source"]["kind"] == "morning"
        assert "PRIVATE" not in result.text
        await weather_db.execute(text("UPDATE authored_products SET published=NULL"))
        result = await async_client.get(url)
        assert (
            result.status_code == 200 and result.json()["periods"][0]["source"] is None
        )

        async def unavailable():
            yield None

        app.dependency_overrides[get_session] = unavailable
        assert (await async_client.get(url)).status_code == 503
    finally:
        app.dependency_overrides.pop(get_session, None)
