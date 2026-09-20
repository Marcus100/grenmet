import hashlib
import json
from copy import deepcopy

import pytest
from sqlalchemy import text

from src.wxwatch.nhc_import import import_manifest, read_local
from tests.wxwatch.test_migration import migrate


def fixture_manifest(root, body=b"WTNT31 KNHC 171200\nAdvisory text", run="run-1"):
    sha = hashlib.sha256(body).hexdigest()
    (root / "objects").mkdir(exist_ok=True)
    (root / "decoded").mkdir(exist_ok=True)
    (root / "objects" / sha).write_bytes(body)
    (root / "decoded" / (sha + ".json")).write_text(
        json.dumps({"text": body.decode(), "issued_at": "2026-09-17T12:00:00Z"})
    )
    record = {
        "id": "tcpat1",
        "group": "storms",
        "kind": "text",
        "code": "TCPAT1",
        "storm_id": "al012026",
        "issued_at": "2026-09-17T12:00:00Z",
        "attempted_at": "2026-09-17T13:00:00Z",
        "status": "success",
        "collection_status": "success",
        "decoding_status": "success",
        "decoded_source_sha256": sha,
        "decoded_file": f"decoded/{sha}.json",
        "source": {
            "raw_file": f"objects/{sha}",
            "sha256": sha,
            "size": len(body),
            "retrieved_at": "2026-09-17T13:00:00Z",
            "http_status": 200,
            "content_type": "text/plain",
        },
    }
    manifest = {"schema_version": 2, "run_id": run, "products": {"tcpat1": record}}
    (root / "manifest.json").write_text(json.dumps(manifest))
    return manifest


def test_import_retries_checks_and_corrections(weather_engine, tmp_path):
    migrate(weather_engine)
    first = fixture_manifest(tmp_path)
    assert import_manifest(tmp_path, "manifest.json")["preview"] is True
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    checked = deepcopy(first)
    checked["run_id"] = "run-2"
    checked["products"]["tcpat1"]["source"].update(
        http_status=304, checked_at="2026-09-17T14:00:00Z"
    )
    (tmp_path / "manifest.json").write_text(json.dumps(checked))
    assert (
        import_manifest(tmp_path, "manifest.json", engine=weather_engine)[
            "checked_unchanged"
        ]
        == 1
    )
    failed = deepcopy(checked)
    failed["run_id"] = "run-3"
    failed["products"]["tcpat1"]["status"] = "failed"
    (tmp_path / "manifest.json").write_text(json.dumps(failed))
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    fixture_manifest(tmp_path, b"WTNT31 KNHC 171200\nCorrected advisory", run="run-4")
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    with weather_engine.connect() as c:
        assert c.scalar(text("SELECT count(*) FROM archive_editions")) == 2
        assert c.scalar(text("SELECT count(*) FROM archive_assets")) == 2
        assert c.scalar(text("SELECT count(*) FROM archive_nhc_events")) == 4
        assert c.scalar(text("SELECT count(*) FROM weather_images")) == 0
        assert (
            c.scalar(
                text(
                    "SELECT count(*) FROM archive_editions WHERE observed_at IS NOT NULL OR valid_start IS NOT NULL OR reference_time IS NOT NULL"
                )
            )
            == 0
        )
        assert (
            c.scalar(
                text("SELECT edition_id FROM archive_nhc_events WHERE outcome='failed'")
            )
            is None
        )
        assert (
            c.scalar(text("SELECT storm_id FROM archive_nhc_text LIMIT 1"))
            == "al012026"
        )
        row = c.execute(
            text(
                "SELECT retrieved_at,checked_at FROM archive_nhc_events WHERE outcome='checked_unchanged'"
            )
        ).one()
        assert row.retrieved_at.hour == 13 and row.checked_at.hour == 14


def test_corruption_aborts_before_writes_and_paths_are_confined(
    weather_engine, tmp_path
):
    migrate(weather_engine)
    manifest = fixture_manifest(tmp_path)
    source = manifest["products"]["tcpat1"]["source"]
    (tmp_path / source["raw_file"]).write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="mismatch"):
        import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    with weather_engine.connect() as c:
        assert c.scalar(text("SELECT count(*) FROM archive_nhc_events")) == 0
    with pytest.raises(ValueError, match="Unsafe"):
        read_local(tmp_path, "../outside")
    manifest = fixture_manifest(tmp_path)
    manifest["products"]["tcpat1"]["issued_at"] = "2026-09-17T12:00:00"
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="timezone"):
        import_manifest(tmp_path, "manifest.json")


async def test_nhc_reader_and_history(async_client, weather_engine, tmp_path):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from src.auth.browser import get_browser_or_token_user
    from src.auth.models import User
    from src.main import app
    from src.wxwatch.router import get_session

    migrate(weather_engine)
    manifest = fixture_manifest(
        tmp_path, b"WTNT31 KNHC 171200\n<script>alert(1)</script>"
    )
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    manifest["run_id"] = "checked-run"
    manifest["products"]["tcpat1"]["source"].update(
        http_status=304, checked_at="2026-09-17T14:00:00Z"
    )
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    engine = create_async_engine(
        weather_engine.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
    )
    sessions = async_sessionmaker(engine)

    async def override():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = override
    with weather_engine.connect() as c:
        edition = c.scalar(text("SELECT id FROM archive_editions"))
    path = f"/api/v1/wxwatch/archive/{edition}/bulletin"
    try:
        assert (await async_client.get(path)).status_code == 401
        app.dependency_overrides[get_browser_or_token_user] = lambda: User(
            email="staff@example.test"
        )
        response = await async_client.get(path)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "private, no-store"
        assert "<script>" in response.json()["text"]
        rows = (await async_client.get("/api/v1/wxwatch/archive?source=nhc")).json()[
            "items"
        ]
        assert rows[0]["has_bulletin"] is True
        assert rows[0]["storm_id"] == "al012026"
        assert rows[0]["issued_at"].startswith("2026-09-17T12:00:00")
        history = (
            await async_client.get(
                f"/api/v1/wxwatch/archive/{edition}/retrievals?limit=1"
            )
        ).json()
        assert history["has_more"] is True
        event = history["items"][0]
        assert event["event_kind"] == "checked_unchanged"
        assert event["is_imported"] is True
        assert "14:00:00" in event["checked_at"]
        assert "13:00:00" in event["retrieved_at"]
        assert "source_metadata" not in event
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_browser_or_token_user, None)
        await engine.dispose()


def image_manifest(root):
    from io import BytesIO

    from PIL import Image

    output = BytesIO()
    Image.new("RGB", (12, 8), "blue").save(output, format="PNG")
    raw = output.getvalue()
    manifest = fixture_manifest(root)
    record = manifest["products"].pop("tcpat1")
    sha = hashlib.sha256(raw).hexdigest()
    record.update(
        id="chart",
        group="charts",
        kind="image",
        code=None,
        issued_at=None,
        decoded_source_sha256=sha,
    )
    record["source"].update(
        raw_file=f"objects/{sha}", sha256=sha, size=len(raw), content_type="text/html"
    )
    (root / record["source"]["raw_file"]).write_bytes(raw)
    (root / record["decoded_file"]).write_text(
        json.dumps({"image": record["source"]["raw_file"]})
    )
    manifest["products"]["chart"] = record
    (root / "manifest.json").write_text(json.dumps(manifest))
    return manifest, raw


async def test_nhc_image_import_to_authenticated_delivery(
    async_client, weather_engine, tmp_path, monkeypatch
):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from src.auth.browser import get_browser_or_token_user
    from src.auth.models import User
    from src.main import app
    from src.wxwatch.config import wxwatch_settings
    from src.wxwatch.router import get_session

    migrate(weather_engine)
    manifest, raw = image_manifest(tmp_path)
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    manifest["run_id"] = "image-check"
    manifest["products"]["chart"]["source"].update(
        http_status=304, checked_at="2026-09-17T14:00:00Z"
    )
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    with weather_engine.connect() as c:
        assert c.scalar(text("SELECT count(*) FROM archive_editions")) == 1
        assert c.scalar(text("SELECT count(*) FROM archive_nhc_text")) == 0
        assert c.scalar(text("SELECT count(*) FROM archive_nhc_events")) == 2
        asset = c.execute(text("SELECT * FROM archive_assets")).mappings().one()
        assert (asset["media_type"], asset["width"], asset["height"]) == (
            "image/png",
            12,
            8,
        )
    engine = create_async_engine(
        weather_engine.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
    )
    sessions = async_sessionmaker(engine)

    async def override():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = override
    monkeypatch.setattr(wxwatch_settings, "LOCAL_ASSET_ROOTS", {"nhc-local": tmp_path})
    try:
        url = f"/api/v1/wxwatch/assets/{asset['id']}"
        assert (await async_client.get(url)).status_code == 401
        app.dependency_overrides[get_browser_or_token_user] = lambda: User(
            email="staff@example.test"
        )
        response = await async_client.get(
            "/api/v1/wxwatch/archive?source=nhc&unknown_time=true"
        )
        assert response.status_code == 200, response.text
        row = response.json()["items"][0]
        assert row["image_asset_id"] == str(asset["id"])
        assert row["has_bulletin"] is False
        assert row["issued_at"] is None and row["nominal_time"] is None
        assert row["time_basis"] == "unknown"
        assert row["replica_state"] == "verified" and row["storage_path"] is None
        image = await async_client.get(url)
        assert image.status_code == 200 and image.content == raw
        assert image.headers["content-type"] == "image/png"
        (tmp_path / manifest["products"]["chart"]["source"]["raw_file"]).unlink()
        assert (await async_client.get(url)).status_code == 503
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_browser_or_token_user, None)
        await engine.dispose()


def test_image_decoder_provenance_and_corrupt_bytes(tmp_path):
    manifest, _ = image_manifest(tmp_path)
    record = manifest["products"]["chart"]
    (tmp_path / record["decoded_file"]).write_text(
        json.dumps({"image": "objects/wrong"})
    )
    with pytest.raises(ValueError, match="provenance"):
        import_manifest(tmp_path, "manifest.json")
    manifest, _ = image_manifest(tmp_path)
    record = manifest["products"]["chart"]
    raw = b"<html>not an image</html>"
    sha = hashlib.sha256(raw).hexdigest()
    record["source"].update(sha256=sha, size=len(raw))
    record["decoded_source_sha256"] = sha
    (tmp_path / record["source"]["raw_file"]).write_bytes(raw)
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="Invalid NHC image"):
        import_manifest(tmp_path, "manifest.json")
