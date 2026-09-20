import hashlib
from uuid import uuid4

from PIL import Image
from pydantic import SecretStr
from sqlalchemy import text

from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.main import app
from src.wxwatch import catalogue
from src.wxwatch.config import wxwatch_settings
from tests.wxwatch.test_gallery import image_database as image_database


def seed_asset(engine, root, data, key=None):
    asset = uuid4()
    sha = hashlib.sha256(data).hexdigest()
    key = key or sha
    (root / key).write_bytes(data)
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO archive_assets(id,sha256,byte_size,media_type) VALUES (:id,:sha,:size,'application/octet-stream')"
            ),
            {"id": asset, "sha": sha, "size": len(data)},
        )
        c.execute(
            text("""INSERT INTO archive_replicas(id,asset_id,backend_key,object_key,state,verified_at,verified_sha256)
            VALUES (:id,:asset,'nhc-local',:key,'verified',now(),:sha)"""),
            {"id": uuid4(), "asset": asset, "key": key, "sha": sha},
        )
    return asset, key


async def test_asset_delivery(
    async_client, image_database, weather_engine, tmp_path, monkeypatch
):
    assert image_database is None
    monkeypatch.setattr(wxwatch_settings, "LOCAL_ASSET_ROOTS", {"nhc-local": tmp_path})
    png = tmp_path / "image.png"
    Image.new("RGB", (3, 3)).save(png)
    asset, key = seed_asset(weather_engine, tmp_path, png.read_bytes())
    url = f"/api/v1/wxwatch/assets/{asset}"
    assert (await async_client.get(url)).status_code == 401
    app.dependency_overrides[get_browser_or_token_user] = lambda: User(
        email="staff@example.test"
    )
    try:
        result = await async_client.get(url)
        assert result.status_code == 200, result.text
        assert result.content == png.read_bytes()
        with weather_engine.begin() as c:
            row = dict(
                c.execute(text("SELECT * FROM weather_images LIMIT 1")).mappings().one()
            )
            edition = catalogue.catalogue_record(c, row)
            c.execute(
                text(
                    "INSERT INTO archive_edition_assets(edition_id,asset_id,role) VALUES (:edition,:asset,'original')"
                ),
                {"edition": edition, "asset": asset},
            )
        listed = await async_client.get(f"/api/v1/wxwatch/archive/{edition}/assets")
        assert listed.status_code == 200
        assert listed.json()[0]["asset_id"] == str(asset)
        assert "object_key" not in listed.text
        assert (
            await async_client.get(f"/api/v1/wxwatch/archive/{uuid4()}/assets")
        ).status_code == 404

        assert result.headers["content-type"] == "image/png"
        assert result.headers["content-disposition"].startswith("inline")
        assert result.headers["cache-control"] == "private, no-store"
        assert (
            await async_client.get(f"/api/v1/wxwatch/assets/{uuid4()}")
        ).status_code == 404
        (tmp_path / key).write_bytes(b"corrupt")
        assert (await async_client.get(url)).status_code == 503
        (tmp_path / key).unlink()
        assert (await async_client.get(url)).status_code == 503
        active, _ = seed_asset(weather_engine, tmp_path, b'<svg onload="alert(1)"/>')
        result = await async_client.get(f"/api/v1/wxwatch/assets/{active}")
        assert result.headers["content-type"] == "application/octet-stream"
        assert result.headers["content-disposition"].startswith("attachment")
        assert result.headers["x-content-type-options"] == "nosniff"
        with weather_engine.begin() as c:
            c.execute(
                text(
                    "UPDATE archive_replicas SET object_key='../outside' WHERE asset_id=:id"
                ),
                {"id": active},
            )
        assert (
            await async_client.get(f"/api/v1/wxwatch/assets/{active}")
        ).status_code == 503
    finally:
        app.dependency_overrides.pop(get_browser_or_token_user, None)


async def test_derivation_identity_and_validation(
    async_client, image_database, weather_engine, tmp_path, monkeypatch
):
    assert image_database is None
    monkeypatch.setattr(wxwatch_settings, "INGEST_TOKEN", SecretStr("a" * 32))
    first, _ = seed_asset(weather_engine, tmp_path, b"input")
    second, _ = seed_asset(weather_engine, tmp_path, b"other input")
    output, _ = seed_asset(weather_engine, tmp_path, b"output")
    body = {
        "input_asset_ids": [str(first), str(second)],
        "output_asset_id": str(output),
        "processor": "decoder",
        "processor_version": "2",
        "options": {"bbox": [1, 2, 3, 4]},
    }
    url = "/api/v1/wxwatch/derivations"
    assert (await async_client.post(url, json=body)).status_code == 401
    headers = {"Authorization": "Bearer " + "a" * 32}
    result = await async_client.post(url, json=body, headers=headers)
    assert result.status_code == 200, result.text
    body["input_asset_ids"].reverse()
    repeated = await async_client.post(url, json=body, headers=headers)
    assert repeated.json() == result.json()
    changed = await async_client.post(
        url, json={**body, "processor_version": "3"}, headers=headers
    )
    assert changed.status_code == 200 and changed.json() != result.json()
    changed = await async_client.post(
        url, json={**body, "options": {"bbox": [2, 3, 4, 5]}}, headers=headers
    )
    assert changed.status_code == 200 and changed.json() != result.json()
    assert (
        await async_client.post(
            url, json={**body, "generated_at": "2026-09-17T00:00:00Z"}, headers=headers
        )
    ).status_code == 409
    assert (
        await async_client.post(
            url, json={**body, "input_asset_ids": [str(output)]}, headers=headers
        )
    ).status_code == 422
    assert (
        await async_client.post(
            url, json={**body, "output_asset_id": str(uuid4())}, headers=headers
        )
    ).status_code == 422
    assert (
        await async_client.post(
            url,
            json={
                **body,
                "input_asset_ids": [str(output)],
                "output_asset_id": str(first),
            },
            headers=headers,
        )
    ).status_code == 409
    with weather_engine.connect() as c:
        assert c.scalar(text("SELECT count(*) FROM archive_derivations")) == 3
        assert c.scalar(text("SELECT count(*) FROM archive_derivation_inputs")) == 6
        assert c.scalar(text("SELECT count(*) FROM archive_editions")) == 0
