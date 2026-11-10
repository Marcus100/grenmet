"""Staff marine guidance: AMZ058 from the newest imported Offshore Waters Forecast."""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.auth.models import User
from src.main import app
from src.wxproducts.dependencies import ProductAuthor, get_author
from src.wxproducts.forecast_pdf import _environment
from src.wxproducts.guidance import compose
from src.wxwatch.dependencies import get_session
from src.wxwatch.nhc_import import import_manifest
from src.wxwatch.nhc_schemas import GuidanceSource, ProductGuidance
from tests.wxwatch.test_migration import migrate

FIXTURE = Path(__file__).with_name("fixtures") / "offnt3-2026-11-09-amz058.txt"
ENDPOINT = "/api/v1/wxwatch/nhc/marine-guidance"


def recent(hours: float = 1) -> str:
    return (datetime.now(UTC) - timedelta(hours=hours)).isoformat()


def record(
    root,
    key,
    body,
    *,
    kind="bulletin",
    code=None,
    group="text",
    issued_at="2026-11-09T19:52:00Z",
):
    sha = hashlib.sha256(body).hexdigest()
    (root / "objects").mkdir(exist_ok=True)
    (root / "decoded").mkdir(exist_ok=True)
    (root / "objects" / sha).write_bytes(body)
    (root / "decoded" / (sha + ".json")).write_text(
        json.dumps({"text": body.decode(), "issued_at": issued_at})
    )
    return {
        "id": key,
        "group": group,
        "kind": kind,
        "code": code or key.upper(),
        "issued_at": issued_at,
        "attempted_at": "2026-11-09T20:00:00Z",
        "status": "success",
        "collection_status": "success",
        "decoding_status": "success",
        "decoded_source_sha256": sha,
        "decoded_file": f"decoded/{sha}.json",
        "source": {
            "raw_file": f"objects/{sha}",
            "sha256": sha,
            "size": len(body),
            "retrieved_at": "2026-11-09T20:00:00Z",
            "http_status": 200,
            "content_type": "text/plain",
        },
    }


def publish(root, products):
    manifest = {"schema_version": 2, "run_id": "run-marine", "products": products}
    (root / "manifest.json").write_text(json.dumps(manifest))


@pytest.fixture
async def archive(weather_engine, tmp_path):
    migrate(weather_engine)
    engine = create_async_engine(
        weather_engine.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
    )
    sessions = async_sessionmaker(engine)

    async def override():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = override
    state = {"kinds": ["marine"]}
    app.dependency_overrides[get_author] = lambda: ProductAuthor(
        User(email="marine@example.test"), state["kinds"]
    )
    try:
        yield weather_engine, tmp_path, state
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_author, None)
        await engine.dispose()


async def test_guidance_requires_sign_in(async_client):
    response = await async_client.get(ENDPOINT)
    assert response.status_code == 401


async def test_marine_guidance_reads_amz058_and_the_latest_outlook(
    async_client, archive
):
    engine, root, _ = archive
    body = FIXTURE.read_bytes()
    publish(
        root,
        {
            "offnt3": record(root, "offnt3", body, issued_at=recent()),
            "outlook": record(
                root,
                "outlook",
                b"Tropical Weather Outlook\nNo tropical cyclones expected.",
                kind="outlook",
                code="TWO",
                group="text",
            ),
        },
    )
    import_manifest(root, "manifest.json", engine=engine)

    response = await async_client.get(ENDPOINT)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    body_json = response.json()
    assert body_json["status"] == "available"
    assert body_json["zone_id"] == "AMZ058"
    assert body_json["zone_name"].startswith("Offshore Waters Windward Islands")
    assert body_json["product"]["product_key"] == "nhc:offnt3"
    assert body_json["stale"] is False
    assert len(body_json["periods"]) == 11
    tonight = body_json["periods"][0]
    assert tonight["label"] == "TONIGHT"
    # Caribbean and Atlantic winds differ tonight: the wind stays empty.
    assert tonight["wind_direction_from"] is None
    assert (tonight["wind_min_kt"], tonight["wind_max_kt"]) == (None, None)
    assert (tonight["sea_min_ft"], tonight["sea_max_ft"]) == (3, 5)
    wed = body_json["periods"][3]
    assert (wed["wind_direction_from"], wed["wind_min_kt"]) == ("E", 15)
    assert body_json["outlook"]["product_key"] == "nhc:outlook"


async def test_missing_import_and_missing_zone_are_reported_not_guessed(
    async_client, archive
):
    engine, root, _ = archive
    response = await async_client.get(ENDPOINT)
    assert response.status_code == 200
    assert response.json()["status"] == "not_imported"
    assert response.json()["periods"] == []
    assert response.json()["product"] is None

    other_zone = FIXTURE.read_bytes().replace(b"AMZ058-", b"AMZ999-")
    publish(root, {"offnt3": record(root, "offnt3", other_zone)})
    import_manifest(root, "manifest.json", engine=engine)
    response = await async_client.get(ENDPOINT)
    assert response.json()["status"] == "zone_missing"
    assert response.json()["periods"] == []
    assert response.json()["product"]["product_key"] == "nhc:offnt3"


async def test_guidance_older_than_twelve_hours_is_flagged_stale(async_client, archive):
    engine, root, _ = archive
    publish(
        root,
        {"offnt3": record(root, "offnt3", FIXTURE.read_bytes(), issued_at=recent(13))},
    )
    import_manifest(root, "manifest.json", engine=engine)

    body_json = (await async_client.get(ENDPOINT)).json()

    assert body_json["status"] == "available"
    assert body_json["stale"] is True
    assert len(body_json["periods"]) == 11


async def test_archive_outage_is_unavailable_not_empty(async_client, monkeypatch):
    from src.wxwatch import database

    monkeypatch.setattr(database, "create_session", lambda: None)
    app.dependency_overrides[get_author] = lambda: ProductAuthor(
        User(email="marine@example.test"), ["marine"]
    )
    try:
        response = await async_client.get(ENDPOINT)
    finally:
        app.dependency_overrides.pop(get_author, None)
    assert response.status_code == 503


async def test_authors_without_marine_access_are_refused(async_client, archive):
    _, _, state = archive
    state["kinds"] = ["morning", "outlook"]
    response = await async_client.get(ENDPOINT)
    assert response.status_code == 403


def test_marine_forecast_accepts_nhc_guidance_and_bulletin_cites_offnt3():
    offnt3 = GuidanceSource(
        edition_id=uuid4(),
        product_key="nhc:offnt3",
        title="OFFNT3",
        issued_at=datetime(2026, 11, 9, 19, 52, tzinfo=UTC),
        sha256="a" * 64,
    )
    guidance = ProductGuidance(sources=[offnt3])
    values = {"synopsis": "Fresh easterlies."}
    assert compose("marine-forecast", values, guidance) == values
    html = (
        _environment()
        .get_template("guidance.html.j2")
        .render(guidance=guidance, graphic_images={})
    )
    assert (
        "Based on NHC Offshore Waters Forecast issued 2026-11-09 19:52:00+00:00" in html
    )
