"""Public satellite endpoints: unauthenticated, GOES-only, cache-friendly."""

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.main import app
from src.storage import service as storage
from src.wxwatch.config import wxwatch_settings
from src.wxwatch.dependencies import get_session
from tests.wxwatch.test_migration import migrate

ROWS = [
    ("old.png", "2026-09-17T06:00:00Z", "100_cloud.png", "goes19", "goes19:cloud.png"),
    ("new.png", "2026-09-17T06:10:00Z", "101_cloud.png", "goes19", "goes19:cloud.png"),
    ("ir.png", "2026-09-17T06:05:00Z", "102_ir.png", "goes19", "goes19:ir.png"),
    ("other.png", "2026-09-17T07:00:00Z", "x.png", "cimss", "cimss:x"),
    ("none.png", None, "103_none.png", "goes19", "goes19:none.png"),
    (
        "bad name!.png",
        "2026-09-17T06:20:00Z",
        "104_bad.png",
        "goes19",
        "goes19:bad.png",
    ),
]


@pytest.fixture
async def public_database(weather_engine):
    migrate(weather_engine)
    with weather_engine.begin() as connection:
        for path, observed, name, spider, key in ROWS:
            connection.exec_driver_sql(
                "INSERT INTO weather_images(storage_path, fetched_at, observation_time,"
                " name, spider_name, product_key) VALUES (%s, '2026-09-17T08:00:00Z',"
                " %s, %s, %s, %s)",
                (path, observed, name, spider, key),
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


async def test_latest_is_anonymous_goes_only_newest_per_product(
    async_client, public_database
):
    assert public_database is None
    response = await async_client.get("/api/v1/wxwatch/public/latest")
    assert response.status_code == 200, response.text
    assert "s-maxage" in response.headers["cache-control"]
    assert "stale-if-error" in response.headers["cache-control"]
    images = response.json()["images"]
    assert [image["product"] for image in images] == ["cloud.png", "ir.png"]
    cloud = images[0]
    assert cloud["observed_at"].startswith("2026-09-17T06:10:00")
    assert cloud["image_url"].endswith(f"/wxwatch/public/images/{cloud['id']}")
    assert "NOAA" in cloud["attribution"]
    assert "storage_path" not in cloud
    assert "new.png" not in response.text


async def test_latest_filters_by_product_and_returns_empty_honestly(
    async_client, public_database
):
    assert public_database is None
    one = await async_client.get("/api/v1/wxwatch/public/latest?product=ir.png")
    assert [i["product"] for i in one.json()["images"]] == ["ir.png"]
    none = await async_client.get("/api/v1/wxwatch/public/latest?product=missing")
    assert none.status_code == 200
    assert none.json() == {"images": []}
    bad = await async_client.get("/api/v1/wxwatch/public/latest?product=a;b")
    assert bad.status_code == 422


async def test_image_serves_local_file_or_signed_redirect(
    async_client, public_database, tmp_path, monkeypatch
):
    assert public_database is None
    latest = await async_client.get("/api/v1/wxwatch/public/latest")
    cloud_id = latest.json()["images"][0]["id"]
    url = f"/api/v1/wxwatch/public/images/{cloud_id}"

    (tmp_path / "new.png").write_bytes(b"\x89PNG-bytes")
    monkeypatch.setattr(wxwatch_settings, "LOCAL_IMAGES_DIR", tmp_path)
    local = await async_client.get(url)
    assert local.status_code == 200
    assert local.headers["content-type"] == "image/png"
    assert "public" in local.headers["cache-control"]

    monkeypatch.setattr(wxwatch_settings, "LOCAL_IMAGES_DIR", None)
    monkeypatch.setattr(
        storage.storage_service,
        "presigned_download_url",
        lambda key, expires_in=None: f"https://signed.example/{key}?e={expires_in}",
    )
    redirect = await async_client.get(url, follow_redirects=False)
    assert redirect.status_code == 307
    assert redirect.headers["location"] == "https://signed.example/wxwatch/new.png?e=60"


async def test_image_refuses_non_goes_and_unknown_ids(async_client, public_database):
    assert public_database is None
    with_other = await async_client.get("/api/v1/wxwatch/public/images/4")
    assert with_other.status_code == 404
    assert (
        await async_client.get("/api/v1/wxwatch/public/images/99999")
    ).status_code == 404
    assert (
        await async_client.get("/api/v1/wxwatch/public/images/abc")
    ).status_code == 422


async def test_database_outage_is_unavailable_not_empty(async_client, monkeypatch):
    from src.wxwatch import database

    monkeypatch.setattr(database, "create_session", lambda: None)
    response = await async_client.get("/api/v1/wxwatch/public/latest")
    assert response.status_code == 503
