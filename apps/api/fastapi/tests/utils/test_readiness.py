import pytest
from fastapi import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from src.utils.router import ready


@pytest.mark.asyncio
async def test_migrated_database_is_ready(db_async: AsyncSession) -> None:
    response = Response()
    assert await ready(db_async, response) == {"status": "ready"}
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_wrong_revision_is_unavailable(db_async: AsyncSession) -> None:
    try:
        await db_async.execute(
            text("UPDATE alembic_version SET version_num = 'wrong-revision'")
        )
        response = Response()
        body = await ready(db_async, response)
        assert response.status_code == 503
        assert body == {"detail": "Database unreachable"}
    finally:
        await db_async.rollback()


@pytest.mark.asyncio
async def test_missing_required_table_is_unavailable(db_async: AsyncSession) -> None:
    try:
        await db_async.execute(
            text("SET LOCAL search_path TO missing_readiness_schema")
        )
        response = Response()
        body = await ready(db_async, response)
        assert response.status_code == 503
        assert body == {"detail": "Database unreachable"}
    finally:
        await db_async.rollback()


@pytest.mark.asyncio
async def test_unreachable_database_is_unavailable() -> None:
    engine = create_async_engine(
        "postgresql+asyncpg://unused:unused@127.0.0.1:1/unused",
        connect_args={"timeout": 1},
    )
    try:
        async with AsyncSession(engine) as session:
            response = Response()
            body = await ready(session, response)
            assert response.status_code == 503
            assert body == {"detail": "Database unreachable"}
    finally:
        await engine.dispose()
