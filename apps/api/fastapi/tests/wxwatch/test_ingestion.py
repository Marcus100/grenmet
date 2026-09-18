from pydantic import SecretStr

from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.main import app
from src.wxwatch.config import wxwatch_settings
from tests.wxproducts.test_migrations import weather_engine as weather_engine
from tests.wxwatch.test_gallery import image_database as image_database

TOKEN = "archive-test-token-" + "x" * 40
HEADERS = {"Authorization": "Bearer " + TOKEN}


async def test_ingestion_lease_deduplication_and_auth(
    async_client, image_database, monkeypatch
):
    assert image_database is None
    monkeypatch.setattr(wxwatch_settings, "LOCAL_IMAGES_DIR", None)
    monkeypatch.setattr(wxwatch_settings, "INGEST_TOKEN", SecretStr(TOKEN))
    start = "/api/v1/wxwatch/runs"
    assert (await async_client.post(start, json={"source": "cimss"})).status_code == 401
    result = await async_client.post(start, json={"source": "cimss"}, headers=HEADERS)
    assert result.status_code == 200, result.text
    run_id = result.json()["id"]
    assert (
        await async_client.post(start, json={"source": "cimss"}, headers=HEADERS)
    ).status_code == 409
    payload = {
        "run_id": run_id,
        "storage_path": "cimss/chart.gif",
        "name": "chart.gif",
        "image_url": "https://example.test/chart.gif",
        "checksum": "abc",
        "fetched_at": "2026-09-17T12:01:00Z",
        "observation_time": "2026-09-17T12:00:00Z",
    }
    url = "/api/v1/wxwatch/ingest"
    first = await async_client.post(url, json=payload, headers=HEADERS)
    assert first.status_code == 200, first.text
    again = await async_client.post(url, json=payload, headers=HEADERS)
    assert again.json() == {"id": first.json()["id"], "created": False}
    assert (
        await async_client.post(
            url, json=payload | {"storage_path": "../secret.gif"}, headers=HEADERS
        )
    ).status_code == 422
    assert (
        await async_client.post(
            url, json=payload | {"storage_path": "goes19/chart.gif"}, headers=HEADERS
        )
    ).status_code == 422
    finish = await async_client.post(
        f"{start}/{run_id}/finish", json={"status": "finished"}, headers=HEADERS
    )
    assert finish.status_code == 204
    assert (
        await async_client.post(url, json=payload, headers=HEADERS)
    ).status_code == 409
    assert (
        await async_client.post(start, json={"source": "cimss"}, headers=HEADERS)
    ).status_code == 200


async def test_private_local_files_and_symlink_escape(
    async_client, tmp_path, monkeypatch
):
    root = tmp_path / "archive"
    root.mkdir()
    (root / "chart.gif").write_bytes(b"GIF89a")
    outside = tmp_path / "secret.gif"
    outside.write_bytes(b"private")
    (root / "escape.gif").symlink_to(outside)
    monkeypatch.setattr(wxwatch_settings, "LOCAL_IMAGES_DIR", root)
    url = "/api/v1/wxwatch/images/"
    assert (await async_client.get(url + "chart.gif")).status_code == 401
    app.dependency_overrides[get_browser_or_token_user] = lambda: User(
        email="staff@example.test"
    )
    try:
        response = await async_client.get(url + "chart.gif")
        assert response.status_code == 200
        assert response.content == b"GIF89a"
        assert response.headers["cache-control"] == "private, no-store"
        assert (await async_client.get(url + "escape.gif")).status_code == 404
        assert (await async_client.get(url + "missing.gif")).status_code == 404
    finally:
        app.dependency_overrides.pop(get_browser_or_token_user, None)


async def test_expired_run_can_be_reclaimed(
    async_client, image_database, weather_engine, monkeypatch
):
    from sqlalchemy import text

    assert image_database is None
    monkeypatch.setattr(wxwatch_settings, "LOCAL_IMAGES_DIR", None)
    monkeypatch.setattr(wxwatch_settings, "INGEST_TOKEN", SecretStr(TOKEN))
    url = "/api/v1/wxwatch/runs"
    first = await async_client.post(url, json={"source": "uwyo"}, headers=HEADERS)
    with weather_engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE collection_runs SET expires_at=now()-interval '1 second' WHERE id=:id"
            ),
            {"id": first.json()["id"]},
        )
    result = await async_client.post(url, json={"source": "uwyo"}, headers=HEADERS)
    assert result.status_code == 200
    assert result.json()["id"] != first.json()["id"]
    with weather_engine.connect() as connection:
        assert (
            connection.scalar(
                text("SELECT status FROM collection_runs WHERE id=:id"),
                {"id": first.json()["id"]},
            )
            == "expired"
        )


async def test_catalogue_sightings_times_corrections_and_atomic_failure(
    async_client, image_database, weather_engine, monkeypatch, tmp_path
):
    import hashlib

    from PIL import Image
    from sqlalchemy import text

    monkeypatch.setattr(wxwatch_settings, "INGEST_TOKEN", SecretStr(TOKEN))
    monkeypatch.setattr(wxwatch_settings, "LOCAL_IMAGES_DIR", tmp_path)
    assert image_database is None
    (tmp_path / "cimss").mkdir()
    path = tmp_path / "cimss/chart.png"
    Image.new("RGB", (8, 6), "blue").save(path)
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    run = await async_client.post(
        "/api/v1/wxwatch/runs", json={"source": "cimss"}, headers=HEADERS
    )
    payload = {
        "run_id": run.json()["id"],
        "storage_path": "cimss/chart.png",
        "name": "chart.png",
        "image_url": "https://example.test/chart.png",
        "checksum": checksum,
        "fetched_at": "2026-09-17T12:01:00Z",
        "observation_time": "2026-09-17T12:00:00Z",
        "time_basis": "source_observation",
    }
    url = "/api/v1/wxwatch/ingest"
    first = await async_client.post(url, json=payload, headers=HEADERS)
    assert first.status_code == 200, first.text
    retry = await async_client.post(url, json=payload, headers=HEADERS)
    assert retry.json() == {"id": first.json()["id"], "created": False}
    sighting = await async_client.post(
        url, json=payload | {"fetched_at": "2026-09-17T12:02:00Z"}, headers=HEADERS
    )
    assert sighting.json()["created"] is False
    later = await async_client.post(
        url,
        json=payload | {"observation_time": "2026-09-17T15:00:00Z"},
        headers=HEADERS,
    )
    assert later.json()["created"] is True
    corrected = tmp_path / "cimss/corrected.png"
    Image.new("RGB", (8, 6), "red").save(corrected)
    correction = payload | {
        "storage_path": "cimss/corrected.png",
        "checksum": hashlib.sha256(corrected.read_bytes()).hexdigest(),
    }
    response = await async_client.post(url, json=correction, headers=HEADERS)
    assert response.status_code == 200 and response.json()["created"] is True
    # A valid new file cannot replace an existing immutable replica path.
    path.write_bytes(corrected.read_bytes())
    conflict = await async_client.post(
        url,
        json=correction
        | {
            "storage_path": "cimss/chart.png",
            "observation_time": "2026-09-17T18:00:00Z",
        },
        headers=HEADERS,
    )
    assert conflict.status_code == 409
    missing = await async_client.post(
        url, json=payload | {"storage_path": "cimss/missing.png"}, headers=HEADERS
    )
    assert missing.status_code == 422
    with weather_engine.connect() as connection:
        assert (
            connection.scalar(
                text("SELECT count(*) FROM weather_images WHERE spider_name='cimss'")
            )
            == 3
        )
        assert connection.scalar(text("SELECT count(*) FROM archive_editions")) == 3
        assert connection.scalar(text("SELECT count(*) FROM archive_assets")) == 2
        assert connection.scalar(text("SELECT count(*) FROM archive_retrievals")) == 4
