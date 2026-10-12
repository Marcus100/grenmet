"""Dedicated NHC queue: drain operator requests, never initiate scheduled pulls."""

import asyncio
import hashlib
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from uuid import uuid4

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession

from src.worker.config import worker_settings
from src.worker.main import startup
from src.wxwatch import database, nhc_import
from src.wxwatch.config import wxwatch_settings

logger = logging.getLogger(__name__)
FAMILY_GROUPS = {
    "tropical_development": {"text", "maps"},
    "active_cyclones": {"storms", "maps", "grids"},
    "marine": {"text", "charts", "grids"},
    "aviation_recon": {"storms", "recon"},
}


@asynccontextmanager
async def archive_session() -> AsyncIterator[AsyncSession]:
    session = database.create_session()
    if session is None:
        raise RuntimeError("NHC archive unavailable")
    async with session:
        yield session


def verified_grid(root: Path, key: str, expected_hash: str) -> Path:
    path = nhc_import.local_path(root, key)
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    if digest.hexdigest() != expected_hash:
        raise ValueError("Grid checksum does not match the archive")
    return path


def import_run(root: Path, manifest: str) -> dict[str, Any]:
    engine = create_engine(
        make_url(wxwatch_settings.DATABASE_URL or "").set(
            drivername="postgresql+psycopg"
        )
    )
    try:
        outcome = nhc_import.import_manifest(root, manifest, engine=engine)
        index = nhc_import.read_local(root, "latest.json")
        with engine.begin() as connection:
            for key, record in json.loads(index)["products"].items():
                connection.execute(
                    text(
                        "INSERT INTO archive_nhc_product_state(product_key,metadata) VALUES (:key,CAST(:data AS jsonb)) ON CONFLICT(product_key) DO UPDATE SET metadata=EXCLUDED.metadata,updated_at=now()"
                    ),
                    {"key": "nhc:" + key, "data": json.dumps(record)},
                )
        return outcome
    finally:
        engine.dispose()


async def execute(payload: dict[str, Any], kind: str, root: Path) -> dict[str, Any]:
    if kind == "point":
        # The existing collector has no py.typed marker.
        from gms_ingest import grids  # type: ignore[import-untyped]

        from src.wxwatch.nhc_service import content

        async with archive_session() as session:
            item = await content(session, payload["edition_id"])
            asset = next(a for a in item.edition.assets if a.role == "netcdf")
            row = (
                await session.execute(
                    text(
                        "SELECT r.object_key,a.sha256 FROM archive_replicas r JOIN archive_assets a ON a.id=r.asset_id WHERE r.asset_id=:id AND r.backend_key='nhc-local' AND r.state='verified' AND r.verified_sha256=a.sha256"
                    ),
                    {"id": asset.asset_id},
                )
            ).first()
            if row is None:
                raise ValueError("Grid replica unavailable")
            path = await asyncio.to_thread(
                verified_grid, root, row.object_key, row.sha256
            )
        records = await asyncio.to_thread(
            grids.point, path, payload["latitude"], payload["longitude"]
        )
        return {
            "edition_id": payload["edition_id"],
            "latitude": payload["latitude"],
            "longitude": payload["longitude"],
            "records": records,
        }
    groups = sorted(
        set().union(*(FAMILY_GROUPS[family] for family in payload["families"]))
    )
    process = await asyncio.create_subprocess_exec(
        "nhc",
        "collect",
        "--groups",
        ",".join(groups),
        "--families",
        ",".join(sorted(payload["families"])),
        "--output-dir",
        str(root),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=3000)
    except BaseException:
        if process.returncode is None:
            process.kill()
            await process.wait()
        raise
    output = stdout.decode(errors="replace").strip()
    if process.returncode not in {0, 1} or ": " not in output:
        raise RuntimeError("NHC collection did not produce a completed manifest")
    run = await asyncio.to_thread(Path(output.rsplit(": ", 1)[1]).resolve)
    if not run.is_relative_to(root / "runs"):
        raise ValueError("Collector manifest is outside archive")
    manifest = str((run / "manifest.json").relative_to(root))
    imported = await asyncio.to_thread(import_run, root, manifest)
    data = json.loads(await asyncio.to_thread(nhc_import.read_local, root, manifest))
    return {
        "imported": imported,
        "run_id": data["run_id"],
        "partial": bool(data["errors"]),
        "products": [
            {
                "id": key,
                "status": value["status"],
                "collection_status": value["collection_status"],
                "decoding_status": value["decoding_status"],
            }
            for key, value in data["products"].items()
        ],
    }


async def drain_requests(_ctx: dict[Any, Any]) -> None:
    root = wxwatch_settings.NHC_ROOT
    if root is None or not wxwatch_settings.DATABASE_URL:
        return None
    token = uuid4()
    async with archive_session() as session:
        await session.execute(
            text(
                "UPDATE archive_nhc_jobs SET status='failed',finished_at=now(),error='Worker recovery attempts exhausted' WHERE status IN ('queued','running') AND attempts>=3 AND (lease_until IS NULL OR lease_until<now())"
            )
        )
        row = (
            (
                await session.execute(
                    text("""WITH pending AS (
            SELECT id FROM archive_nhc_jobs WHERE status='queued' OR (status='running' AND lease_until<now())
            ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
            UPDATE archive_nhc_jobs SET status='running',started_at=coalesce(started_at,now()),
            lease_until=now()+INTERVAL '2 minutes',lease_token=:token,attempts=attempts+1
            WHERE id IN (SELECT id FROM pending) RETURNING *"""),
                    {"token": token},
                )
            )
            .mappings()
            .first()
        )
        await session.commit()
    if row is None:
        return None
    root = await asyncio.to_thread(root.resolve)
    task = asyncio.create_task(execute(row["payload"], row["kind"], root))
    try:
        while not task.done():
            done, _ = await asyncio.wait({task}, timeout=30)
            if not done:
                async with archive_session() as session:
                    changed = await session.execute(
                        text(
                            "UPDATE archive_nhc_jobs SET lease_until=now()+INTERVAL '2 minutes' WHERE id=:id AND lease_token=:token AND status='running' RETURNING id"
                        ),
                        {"id": row["id"], "token": token},
                    )
                    await session.commit()
                    if changed.scalar_one_or_none() is None:
                        raise RuntimeError("NHC request lease lost")
        result = task.result()
        completed = set(row["payload"].get("families", []))
        while row["kind"] == "pull":
            async with archive_session() as session:
                await session.execute(text("SELECT pg_advisory_xact_lock(73190508)"))
                current = (
                    (
                        await session.execute(
                            text(
                                "SELECT payload,lease_token FROM archive_nhc_jobs WHERE id=:id FOR UPDATE"
                            ),
                            {"id": row["id"]},
                        )
                    )
                    .mappings()
                    .one()
                )
                if current["lease_token"] != token:
                    raise RuntimeError("NHC request lease lost")
                missing = set(current["payload"]["families"]) - completed
                if not missing:
                    await session.execute(
                        text(
                            "UPDATE archive_nhc_jobs SET status=:status,result=CAST(:result AS jsonb),finished_at=now(),lease_until=NULL WHERE id=:id AND lease_token=:token"
                        ),
                        {
                            "id": row["id"],
                            "token": token,
                            "status": "partial" if result.get("partial") else "success",
                            "result": json.dumps(result),
                        },
                    )
                    await session.commit()
                    return None
                await session.execute(
                    text(
                        "UPDATE archive_nhc_jobs SET result=CAST(:result AS jsonb),lease_until=now()+INTERVAL '2 minutes' WHERE id=:id AND lease_token=:token"
                    ),
                    {"id": row["id"], "token": token, "result": json.dumps(result)},
                )
                await session.commit()
            task = asyncio.create_task(
                execute({"families": sorted(missing)}, "pull", root)
            )
            while not task.done():
                done, _ = await asyncio.wait({task}, timeout=30)
                if not done:
                    async with archive_session() as session:
                        updated = await session.execute(
                            text(
                                "UPDATE archive_nhc_jobs SET lease_until=now()+INTERVAL '2 minutes' WHERE id=:id AND lease_token=:token AND status='running' RETURNING id"
                            ),
                            {"id": row["id"], "token": token},
                        )
                        await session.commit()
                        if updated.scalar_one_or_none() is None:
                            raise RuntimeError("NHC request lease lost")
            extra = task.result()
            result["products"] = list(
                {
                    item["id"]: item for item in result["products"] + extra["products"]
                }.values()
            )
            result["partial"] = bool(result.get("partial") or extra.get("partial"))
            completed.update(missing)
        status = "partial" if result.get("partial") else "success"
        error = None
    except asyncio.CancelledError:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        raise
    except Exception:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        logger.exception("NHC operator request failed")
        result, status, error = (
            None,
            "failed",
            "Collection or decoding failed. Inspect source status and retry.",
        )
    async with archive_session() as session:
        await session.execute(
            text(
                "UPDATE archive_nhc_jobs SET status=:status,result=CAST(:result AS jsonb),error=:error,finished_at=now(),lease_until=NULL WHERE id=:id AND lease_token=:token"
            ),
            {
                "id": row["id"],
                "token": token,
                "status": status,
                "result": json.dumps(result) if result is not None else None,
                "error": error,
            },
        )
        await session.commit()
    return None


class NhcWorkerSettings:
    functions = [drain_requests]
    cron_jobs = [
        cron(
            "src.worker.nhc.drain_requests",
            second=set(range(0, 60, 5)),
            unique=True,
        )
    ]
    queue_name = "grenmet:nhc"
    redis_settings = RedisSettings.from_dsn(worker_settings.redis_dsn)
    on_startup = startup
    max_jobs = 1
    job_timeout = 3300
    health_check_interval = 30
    health_check_key = "grenmet:nhc:health"
    max_tries = 1
