"""HTTP authoring acceptance with separate run-owned archive/product databases."""

import json
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.main import app
from src.wxproducts import database as products_database
from src.wxproducts import validation
from src.wxproducts.dependencies import get_session as products_session
from src.wxwatch import database as archive_database
from src.wxwatch.config import wxwatch_settings
from src.wxwatch.dependencies import get_session as archive_session
from src.wxwatch.nhc_import import import_manifest
from tests.wxproducts.test_migrations import migrate as migrate_products
from tests.wxproducts.test_validation import complete
from tests.wxwatch.test_migration import migrate as migrate_archive
from tests.wxwatch.test_nhc_import import fixture_manifest


@pytest.fixture
async def guidance_databases(
    weather_engine, fresh_weather_engine, monkeypatch, tmp_path
):
    migrate_archive(weather_engine)
    migrate_products(fresh_weather_engine)
    engines = [
        create_async_engine(
            engine.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
        )
        for engine in [weather_engine, fresh_weather_engine]
    ]
    archive, products = [
        async_sessionmaker(engine, expire_on_commit=False) for engine in engines
    ]

    async def read_archive():
        async with archive() as session:
            yield session

    async def read_products():
        async with products() as session:
            yield session

    app.dependency_overrides[archive_session] = read_archive
    app.dependency_overrides[products_session] = read_products
    monkeypatch.setattr(archive_database, "create_session", archive)
    monkeypatch.setattr(products_database, "create_session", products)
    monkeypatch.setattr(wxwatch_settings, "LOCAL_ASSET_ROOTS", {"nhc-local": tmp_path})
    monkeypatch.setattr(wxwatch_settings, "NHC_ROOT", tmp_path)
    monkeypatch.setattr(
        wxwatch_settings,
        "DATABASE_URL",
        weather_engine.url.render_as_string(hide_password=False),
    )
    try:
        yield weather_engine
    finally:
        app.dependency_overrides.pop(archive_session, None)
        app.dependency_overrides.pop(products_session, None)
        for engine in engines:
            await engine.dispose()


@pytest.mark.parametrize("kind", ["outlook", "cyclone", "marine"])
async def test_pull_inspect_draft_preview_publish_flow(
    async_client,
    guidance_databases,
    tmp_path,
    superuser_token_headers_async,
    monkeypatch,
    kind,
):
    from gms_ingest import facts

    from src.worker import nhc

    headers = superuser_token_headers_async
    base = "/api/v1/wxwatch/nhc"
    for method, path, payload in [
        ("get", "/editions", None),
        ("post", "/pulls", {"families": ["marine"]}),
    ]:
        response = await async_client.request(method, base + path, json=payload)
        assert response.status_code == 401

    # Only the external collection boundary is substituted: jobs, catalogue,
    # exact editions, authentication and all authoring/PDF/public routes are real.
    async def collect(_payload, _kind, _root):
        manifest = fixture_manifest(tmp_path)
        record = manifest["products"]["tcpat1"]
        record["source"]["url"] = "https://www.nhc.noaa.gov/xml/TWOAT.xml"
        decoded_path = tmp_path / record["decoded_file"]
        decoded = json.loads(decoded_path.read_text())
        decoded["disturbances"] = [
            {
                "index": 1,
                "heading": "Eastern disturbance",
                "narrative": "Scattered showers",
                "probabilities": {
                    "48 hours": {
                        "percent": None,
                        "category": "low",
                        "statement": "near zero percent",
                    }
                },
            }
        ]
        decoded["text"] += (
            "\nESTIMATED MINIMUM CENTRAL PRESSURE 1008 MB\nMAX SUSTAINED WINDS 35 KT"
        )
        decoded["zones"] = [
            {
                "zone_id": "AMZ035",
                "text": ".TODAY...NE winds 15 to 20 kt. Seas 4 to 6 ft.",
            }
        ]
        decoded["structured"] = facts.extract(decoded)
        decoded_path.write_text(json.dumps(decoded))
        (tmp_path / "manifest.json").write_text(json.dumps(manifest))
        import_manifest(tmp_path, "manifest.json", engine=guidance_databases)
        return {"partial": False, "products": [{"id": "tcpat1", "status": "success"}]}

    monkeypatch.setattr(nhc, "execute", collect)
    requested = await async_client.post(
        base + "/pulls",
        headers=headers,
        json={
            "families": [
                "tropical_development",
                "active_cyclones",
                "marine",
                "aviation_recon",
            ]
        },
    )
    assert requested.status_code == 202, requested.text
    await nhc.drain_requests({})
    status = await async_client.get(
        base + "/jobs/" + requested.json()["id"], headers=headers
    )
    assert status.json()["status"] == "success", status.text
    editions = await async_client.get(base + "/editions", headers=headers)
    assert editions.status_code == 200, editions.text
    edition = editions.json()["items"][0]
    content = await async_client.get(
        base + "/editions/" + edition["id"], headers=headers
    )
    assert (
        content.json()["decoded"]["structured"]["systems"][0]["name"]
        == "Eastern disturbance"
    )
    original = next(asset for asset in edition["assets"] if asset["role"] == "original")
    asset_path = "/api/v1/wxwatch/assets/" + original["asset_id"]
    assert (await async_client.get(asset_path)).status_code == 401
    assert (await async_client.get(asset_path, headers=headers)).status_code == 200
    proposed = await async_client.post(
        base + "/prefill",
        headers=headers,
        json={
            "kind": kind,
            "edition_ids": [edition["id"]],
            "zone_id": "AMZ035",
            "period_label": "TODAY",
        },
    )
    assert proposed.status_code == 200, proposed.text
    guidance = proposed.json()["guidance"]
    if kind == "marine":
        guidance["local_assessment"] = (
            "Assessed for Grenada waters by the duty forecaster."
        )
        assert proposed.json()["values"]["waveHeightMin"] == "1.22"
    now = datetime.now(validation.GRENADA)
    values = {
        **complete(kind),
        **proposed.json()["values"],
        "issuedAt": (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M"),
        "validFrom": (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M"),
        "validTo": (now + timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M"),
    }
    if "nextUpdate" in values:
        values["nextUpdate"] = (now + timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M")
    payload = {
        "id": str(uuid4()),
        "kind": kind,
        "values": values,
        "guidance": guidance,
        "expectedRevision": 0,
        "action": "draft",
        "changeSummary": "Reviewed source selection",
        "reviewed": False,
    }
    path = "/api/v1/wxproducts/products"
    draft = await async_client.post(path, headers=headers, json=payload)
    assert draft.status_code == 200, draft.text
    assert draft.json()["guidance"]["sources"][0]["edition_id"] == edition["id"]
    preview_body = {
        "kind": kind,
        "values": draft.json()["values"],
        "guidance": draft.json()["guidance"],
        "expectedRevision": 1,
        "changeSummary": "Reviewed local issue",
    }
    preview = await async_client.post(
        path + "/preview", headers=headers, json=preview_body
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["errors"] == [], preview.text
    pdf = await async_client.post(
        path + "/preview/pdf", headers=headers, json=preview_body
    )
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF"), (
        pdf.text[:200] if pdf.status_code != 200 else "invalid PDF"
    )
    # Missing preview confirmation remains a publication error.
    publish_body = {
        **payload,
        "values": preview.json()["values"],
        "guidance": preview.json()["guidance"],
        "expectedRevision": 1,
        "action": "publish",
        "changeSummary": "Reviewed local issue",
    }
    denied = await async_client.post(path, headers=headers, json=publish_body)
    assert denied.status_code == 422, denied.text
    publish_body["reviewed"] = True
    published = await async_client.post(path, headers=headers, json=publish_body)
    assert published.status_code == 200, published.text
    saved_pdf = await async_client.get(
        path + f"/{payload['id']}/revisions/2/pdf", headers=headers
    )
    assert saved_pdf.status_code == 200 and saved_pdf.content.startswith(b"%PDF")
    public = await async_client.get(
        "/api/v1/wxproducts/public/products/" + payload["id"]
    )
    assert public.status_code == 200, public.text
    assert "guidance" not in public.json()
    if kind == "outlook":
        assert "near zero percent" in public.json()["values"]["systems"]
        assert "formationChance48h" not in public.json()["values"]
    stale = await async_client.post(path, headers=headers, json=publish_body)
    assert stale.status_code == 409

    # Withdrawal preserves the saved revision and must remain available during
    # an NHC archive outage; it does not accept new guidance content.
    monkeypatch.setattr(archive_database, "create_session", lambda: None)
    withdrawn = await async_client.post(
        path,
        headers=headers,
        json={
            **publish_body,
            "action": "withdraw",
            "expectedRevision": 2,
            "changeSummary": "Withdraw while guidance archive is unavailable",
        },
    )
    assert withdrawn.status_code == 200, withdrawn.text
    assert withdrawn.json()["guidance"] == published.json()["guidance"]
    assert (
        await async_client.get("/api/v1/wxproducts/public/products/" + payload["id"])
    ).status_code == 404


async def test_nhc_authoring_keeps_existing_product_permissions(
    async_client, guidance_databases, normal_user_token_headers_async
):
    assert guidance_databases is not None
    headers = normal_user_token_headers_async
    response = await async_client.get("/api/v1/wxwatch/nhc/editions", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["items"] == []
    response = await async_client.post(
        "/api/v1/wxwatch/nhc/pulls", headers=headers, json={"families": ["marine"]}
    )
    assert response.status_code == 403, response.text
    for kind in ["outlook", "cyclone", "marine"]:
        response = await async_client.post(
            "/api/v1/wxwatch/nhc/prefill",
            headers=headers,
            json={"kind": kind, "edition_ids": [str(uuid4())]},
        )
        assert response.status_code == 403, response.text
