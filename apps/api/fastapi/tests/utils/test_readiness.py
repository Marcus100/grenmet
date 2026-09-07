import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from src.utils.router import ready


@pytest.mark.asyncio
async def test_migrated_database_is_ready(db_async: AsyncSession) -> None:
    assert await ready(db_async) == {"status": "ready"}


@pytest.mark.asyncio
async def test_wrong_revision_is_unavailable(db_async: AsyncSession) -> None:
    try:
        await db_async.execute(
            text("UPDATE alembic_version SET version_num = 'wrong-revision'")
        )
        with pytest.raises(HTTPException) as error:
            await ready(db_async)
        assert error.value.status_code == 503
    finally:
        await db_async.rollback()


@pytest.mark.asyncio
async def test_missing_required_table_is_unavailable(db_async: AsyncSession) -> None:
    try:
        await db_async.execute(
            text("SET LOCAL search_path TO missing_readiness_schema")
        )
        with pytest.raises(HTTPException) as error:
            await ready(db_async)
        assert error.value.status_code == 503
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
            with pytest.raises(HTTPException) as error:
                await ready(session)
            assert error.value.status_code == 503
    finally:
        await engine.dispose()
