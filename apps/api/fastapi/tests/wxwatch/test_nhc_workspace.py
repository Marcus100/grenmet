import json
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.wxwatch import database, nhc_service
from src.wxwatch.nhc_import import import_manifest
from tests.wxwatch.test_migration import migrate
from tests.wxwatch.test_nhc_import import fixture_manifest


@pytest.fixture
async def archive_sessions(weather_engine):
    migrate(weather_engine)
    engine = create_async_engine(
        weather_engine.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
    )
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


async def test_duplicate_pulls_coalesce_queued_and_running_scopes(archive_sessions):
    async with archive_sessions() as session:
        first = await nhc_service.create_job(
            session, "pull", {"families": ["marine"]}, uuid4()
        )
        duplicate = await nhc_service.create_job(
            session, "pull", {"families": ["active_cyclones"]}, uuid4()
        )
        assert first.id == duplicate.id
        await session.execute(
            text("UPDATE archive_nhc_jobs SET status='running' WHERE id=:id"),
            {"id": first.id},
        )
        await session.commit()
        widened = await nhc_service.create_job(
            session, "pull", {"families": ["aviation_recon"]}, uuid4()
        )
        assert widened.id == first.id
        assert await session.scalar(text("SELECT count(*) FROM archive_nhc_jobs")) == 1
        payload = await session.scalar(
            text("SELECT payload FROM archive_nhc_jobs WHERE id=:id"), {"id": first.id}
        )
        assert set(payload["families"]) == {
            "marine",
            "active_cyclones",
            "aviation_recon",
        }


async def test_source_editions_corrections_failures_and_history(
    archive_sessions, weather_engine, tmp_path
):
    manifest = fixture_manifest(tmp_path)
    record = manifest["products"]["tcpat1"]
    record["source"]["url"] = "https://www.nhc.noaa.gov/text/TCPAT1.shtml"
    decoded_file = tmp_path / record["decoded_file"]
    decoded = json.loads(decoded_file.read_text())
    decoded["structured"] = {
        "systems": [
            {
                "source_feature_key": "1",
                "name": "Eastern disturbance",
                "feature_type": "disturbance",
                "narrative": "Scattered showers.",
                "facts": [
                    {
                        "key": "formation_probability",
                        "record_type": "forecast",
                        "value": None,
                        "description": "low",
                        "unit": "percent",
                        "horizon_hours": 48,
                        "source_text": "near 0 percent",
                    }
                ],
            }
        ],
        "facts": [],
    }
    decoded_file.write_text(json.dumps(decoded))
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    async with archive_sessions() as session:
        page = await nhc_service.browse(
            session,
            family=None,
            product=None,
            storm=None,
            start=None,
            end=None,
            latest=True,
            offset=0,
            limit=30,
        )
        assert len(page.items) == 1
        old = page.items[0]
        assert old.observed_at is None and old.valid_start is None
        proposal = await nhc_service.prefill(session, "outlook", [old.id])
        assert proposal.guidance.sources[0].edition_id == old.id
        fact = proposal.guidance.systems[0].facts[0]
        assert fact.value is None and fact.source_text == "near 0 percent"
        assert fact.source_edition_id == old.id
        repeated = await nhc_service.prefill(session, "outlook", [old.id])
        assert repeated.guidance.systems[0].id == proposal.guidance.systems[0].id
    corrected = fixture_manifest(
        tmp_path, body=b"WTNT31 KNHC 171200\nCorrected source", run="correction"
    )
    corrected["products"]["tcpat1"]["source"].update(
        url=record["source"]["url"], retrieved_at="2026-09-17T14:00:00Z"
    )
    (tmp_path / "manifest.json").write_text(json.dumps(corrected))
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    async with archive_sessions() as session:
        checks = await nhc_service.check_sources(session, [old.id])
        assert checks[0]["newer_edition_id"] != old.id
        failed = deepcopy(corrected)
        failed["run_id"] = "failure"
        failed["products"]["tcpat1"].update(
            status="failed", attempted_at="2026-09-17T15:00:00Z"
        )
        (tmp_path / "manifest.json").write_text(json.dumps(failed))
        import_manifest(tmp_path, "manifest.json", engine=weather_engine)
        history = await nhc_service.browse(
            session,
            family=None,
            product=None,
            storm="al012026",
            start=None,
            end=None,
            latest=False,
            offset=0,
            limit=30,
        )
        assert len(history.items) == 2
        latest = history.items[0]
        assert latest.status == "failed"
        assert latest.issued_at == old.issued_at
        assert latest.first_received_at == datetime(2026, 9, 17, 14, tzinfo=UTC)
        saved = await nhc_service.content(session, old.id)
        assert saved.decoded["structured"]["systems"][0]["facts"][0]["value"] is None


async def test_worker_coalesces_widened_running_pull_and_reports_partial(
    archive_sessions, weather_engine, tmp_path, monkeypatch
):
    from src.worker import nhc

    monkeypatch.setattr(database, "create_session", archive_sessions)
    monkeypatch.setattr(
        nhc.wxwatch_settings,
        "DATABASE_URL",
        weather_engine.url.render_as_string(hide_password=False),
    )
    monkeypatch.setattr(nhc.wxwatch_settings, "NHC_ROOT", tmp_path)
    actor = uuid4()
    async with archive_sessions() as session:
        first = await nhc_service.create_job(
            session, "pull", {"families": ["marine"]}, actor
        )
    calls = []

    async def collect(payload, _kind, _root):
        calls.append(set(payload["families"]))
        if len(calls) == 1:
            async with archive_sessions() as session:
                duplicate = await nhc_service.create_job(
                    session, "pull", {"families": ["aviation_recon"]}, actor
                )
                assert duplicate.id == first.id
        return {
            "partial": len(calls) == 1,
            "products": [{"id": next(iter(payload["families"])), "status": "success"}],
            "imported": {},
            "run_id": "fixture",
        }

    monkeypatch.setattr(nhc, "execute", collect)
    await nhc.drain_requests({})
    assert calls == [{"marine"}, {"aviation_recon"}]
    async with archive_sessions() as session:
        job = await nhc_service.job(session, first.id)
        assert job.status == "partial"
        assert len(job.result["products"]) == 2
        assert job.finished_at is not None
    await nhc.drain_requests({})
    assert len(calls) == 2


async def test_worker_recovers_expired_lease(
    archive_sessions, weather_engine, tmp_path, monkeypatch
):
    from src.worker import nhc

    monkeypatch.setattr(database, "create_session", archive_sessions)
    monkeypatch.setattr(
        nhc.wxwatch_settings,
        "DATABASE_URL",
        weather_engine.url.render_as_string(hide_password=False),
    )
    monkeypatch.setattr(nhc.wxwatch_settings, "NHC_ROOT", tmp_path)
    async with archive_sessions() as session:
        first = await nhc_service.create_job(
            session, "pull", {"families": ["marine"]}, uuid4()
        )
        await session.execute(
            text(
                "UPDATE archive_nhc_jobs SET status='running',lease_token=:token,lease_until=now()-INTERVAL '1 minute',attempts=1 WHERE id=:id"
            ),
            {"id": first.id, "token": uuid4()},
        )
        await session.commit()

    async def collect(_payload, _kind, _root):
        return {"products": [], "partial": False}

    monkeypatch.setattr(nhc, "execute", collect)
    await nhc.drain_requests({})
    async with archive_sessions() as session:
        job = await nhc_service.job(session, first.id)
        assert job.status == "success"
        assert (
            await session.scalar(
                text("SELECT attempts FROM archive_nhc_jobs WHERE id=:id"),
                {"id": first.id},
            )
            == 2
        )


async def test_native_grid_sampling_prefill_retains_location_period_and_units(
    archive_sessions, weather_engine, tmp_path, monkeypatch
):
    import xarray as xr

    from src.worker import nhc
    from src.wxwatch.nhc_schemas import ProductGuidance

    manifest = fixture_manifest(tmp_path)
    record = manifest["products"].pop("tcpat1")
    record.update(
        id="grid-001-003-wspd",
        code="wspd",
        group="grids",
        kind="grid",
        storm_id=None,
        issued_at=None,
    )
    path = tmp_path / record["decoded_file"]
    grid_path = path.parent / "grid.nc"
    xr.Dataset(
        {
            "value": (("record", "cell"), [[10.0, 15.0]]),
            "units": ("record", ["m s**-1"]),
            "name": ("record", ["Wind speed"]),
            "dataDate": ("record", ["20261012"]),
            "dataTime": ("record", ["0000"]),
            "validityDate": ("record", ["20261012"]),
            "validityTime": ("record", ["0600"]),
            "stepRange": ("record", ["6"]),
        },
        coords={
            "latitude": ("cell", [12.0, 13.0]),
            "longitude": ("cell", [-61.5, -61.0]),
        },
        attrs={"bbox": [-65.0, 8.0, -55.0, 20.0]},
    ).to_netcdf(grid_path)
    path.write_text(
        json.dumps(
            {
                "bbox": [-65, 8, -55, 20],
                "netcdf": "grid.nc",
                "reference_time": "2026-10-12T00:00:00Z",
                "valid_start": "2026-10-12T06:00:00Z",
                "valid_end": None,
                "records": [],
                "structured": {},
            }
        )
    )
    manifest["products"][record["id"]] = record
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    import_manifest(tmp_path, "manifest.json", engine=weather_engine)
    monkeypatch.setattr(database, "create_session", archive_sessions)
    monkeypatch.setattr(
        nhc.wxwatch_settings,
        "DATABASE_URL",
        weather_engine.url.render_as_string(hide_password=False),
    )
    monkeypatch.setattr(nhc.wxwatch_settings, "NHC_ROOT", tmp_path)
    async with archive_sessions() as session:
        edition = await session.scalar(text("SELECT id FROM archive_editions"))
        request = await nhc_service.create_job(
            session,
            "point",
            {"edition_id": str(edition), "latitude": 12.05, "longitude": -61.75},
            uuid4(),
        )
    await nhc.drain_requests({})
    async with archive_sessions() as session:
        done = await nhc_service.job(session, request.id)
        assert done.status == "success", done.error
        item = await nhc_service.content(session, edition)
        assert item.edition.issued_at is None
        assert item.edition.reference_time.hour == 0
        assert item.edition.valid_start.hour == 6
        assert item.edition.valid_end is None
        proposed = await nhc_service.prefill(
            session, "marine", [edition], point_job_ids=[request.id]
        )
        fact = proposed.guidance.facts[0]
        assert fact.value == 10 and fact.unit == "m s**-1"
        assert (
            fact.sample.cell_latitude == 12 and fact.sample.requested_latitude == 12.05
        )
        assert fact.sample.validity_time == "0600" and fact.sample.distance_km > 0
        validated = await nhc_service.validate_sources(session, proposed.guidance)
        assert validated.facts[0].sample == fact.sample
        forged = ProductGuidance.model_validate(proposed.guidance.model_dump())
        forged.facts[0].sample.cell_latitude = 13
        with pytest.raises(ValueError, match="must match"):
            await nhc_service.validate_sources(session, forged)
