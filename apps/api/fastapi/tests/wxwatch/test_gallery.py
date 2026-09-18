from datetime import date, datetime
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.main import app
from src.wxwatch import service
from src.wxwatch.router import get_session
from src.wxwatch.schemas import WeatherImage
from tests.wxproducts.test_migrations import weather_engine as weather_engine
from tests.wxwatch.test_migration import migrate

SCHEMA = (
    Path(__file__).resolve().parents[4]
    / "web/gaa-admin/drizzle/wxwatch/0000_slippery_magma.sql"
)

DAY = date(2026, 9, 17)


def image(identifier, observed, fetched, spider="goes19", name="123_cloud.png"):
    values = dict.fromkeys(
        k for k, v in WeatherImage.model_fields.items() if v.is_required()
    )
    return WeatherImage.model_validate(
        values
        | {
            "id": identifier,
            "name": name,
            "spider_name": spider,
            "storage_path": "cloud.png",
            "observation_time": datetime.fromisoformat(observed) if observed else None,
            "fetched_at": datetime.fromisoformat(fetched),
        }
    )


def test_goes_uses_first_observation_in_floor_bucket_not_latest_download():
    rows = [
        image(2, "2026-09-17T08:59:00Z", "2026-09-17T10:00:00Z"),
        image(1, "2026-09-17T06:02:00Z", "2026-09-17T06:03:00Z"),
    ]
    group = service.group_images(rows, DAY).groups[0]
    assert group.name == "cloud.png"
    assert group.synopticImages.h06.id == 1
    assert group.synopticImages.h09 is None
    assert len(group.synopticImages.model_dump()) == 8


def test_other_sources_keep_name_and_choose_latest_fetch():
    rows = [
        image(1, "2026-09-17T06:00:00Z", "2026-09-17T06:01:00Z", "cimss"),
        image(2, "2026-09-17T06:01:00Z", "2026-09-17T08:00:00Z", "cimss"),
    ]
    group = service.group_images(rows, DAY).groups[0]
    assert group.name == "123_cloud.png"
    assert group.synopticImages.h06.id == 2


def test_utc_bounds_null_observations_and_midnight():
    rows = [
        image(i, observed, "2026-09-17T23:00:00Z")
        for i, observed in enumerate(
            [
                None,
                "2026-09-16T23:59:59Z",
                "2026-09-18T00:00:00Z",
                "2026-09-17T23:59:59Z",
            ]
        )
    ]
    group = service.group_images(rows, DAY).groups[0]
    assert group.synopticImages.h21.id == 3
    assert group.synopticImages.h00 is None


@pytest.fixture
async def image_database(weather_engine):
    migrate(weather_engine)
    with weather_engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO weather_images(storage_path, fetched_at, observation_time, name, spider_name, product_key) VALUES ('cloud.png', '2026-09-17T06:00:00Z', '2026-09-17T06:00:00Z', '123_cloud.png', 'goes19', 'goes19:cloud.png')"
        )
    engine = create_async_engine(
        weather_engine.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
    )
    sessions = async_sessionmaker(engine)

    async def override():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_session, None)
        await engine.dispose()


async def test_authenticated_contract_reads_real_legacy_schema(
    async_client, image_database
):
    assert image_database is None
    url = "/api/v1/wxwatch/metadata?day=2026-09-17"
    assert (await async_client.get(url)).status_code == 401
    app.dependency_overrides[get_browser_or_token_user] = lambda: User(
        email="viewer@example.test"
    )
    try:
        result = await async_client.get(url)
        assert result.status_code == 200, result.text
        group = result.json()["groups"][0]
        assert group["synopticImages"]["06"]["storagePath"] == "cloud.png"
        assert "rawMetadata" not in result.text
        assert result.headers["cache-control"] == "private, no-store"
        assert (
            await async_client.get("/api/v1/wxwatch/metadata?day=invalid")
        ).status_code == 422
        assert (await async_client.get("/api/v1/wxwatch/ready")).status_code == 204
    finally:
        app.dependency_overrides.pop(get_browser_or_token_user, None)


async def test_missing_database_is_unavailable_not_empty(async_client, monkeypatch):
    from src.wxwatch import database

    monkeypatch.setattr(database, "create_session", lambda: None)
    response = await async_client.get("/api/v1/wxwatch/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "Weather image metadata is unavailable"}


async def test_catalogue_evidence_reaches_authenticated_gallery(
    async_client, image_database, weather_engine
):
    from sqlalchemy import text

    from src.wxwatch import catalogue

    assert image_database is None
    with weather_engine.begin() as connection:
        row = dict(
            connection.execute(text("SELECT * FROM weather_images LIMIT 1"))
            .mappings()
            .one()
        )
        connection.execute(
            text(
                "UPDATE weather_images SET time_basis='estimated_analysis' WHERE id=:id"
            ),
            {"id": row["id"]},
        )
        edition = catalogue.catalogue_record(
            connection, row | {"time_basis": "estimated_analysis"}
        )
        connection.execute(
            text(
                "INSERT INTO collection_runs(id,source) VALUES ('00000000-0000-0000-0000-000000000001','goes19')"
            )
        )
        connection.execute(
            text("""INSERT INTO archive_retrievals(id,edition_id,run_id,retrieved_at,image_url,storage_path,checksum,source_metadata)
            VALUES ('00000000-0000-0000-0000-000000000002',:edition,'00000000-0000-0000-0000-000000000001','2026-09-17T09:00:00Z','https://example.test/chart.png','cloud.png','abc','{}')"""),
            {"edition": edition},
        )
    app.dependency_overrides[get_browser_or_token_user] = lambda: User(
        email="viewer@example.test"
    )
    try:
        response = await async_client.get("/api/v1/wxwatch/metadata?day=2026-09-17")
        assert response.status_code == 200
        image = response.json()["groups"][0]["synopticImages"]["06"]
        assert image["archiveObservedAt"] is None
        assert image["archiveNominalTime"].startswith("2026-09-17T06:00:00")
        assert image["latestRetrievedAt"].startswith("2026-09-17T09:00:00")
        assert image["verificationStatus"] == "pending"
        assert image["verifiedSha256"] is None
        assert "rawMetadata" not in image
    finally:
        app.dependency_overrides.pop(get_browser_or_token_user, None)
