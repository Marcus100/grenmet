from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from .config import janitorial_settings

_engine: AsyncEngine | None = None


def get_engine() -> AsyncEngine | None:
    global _engine
    if _engine is None and janitorial_settings.DATABASE_URL:
        url = make_url(janitorial_settings.DATABASE_URL)
        if url.get_backend_name() != "postgresql":
            raise ValueError("JANITORIAL_DATABASE_URL must use PostgreSQL")
        _engine = create_async_engine(
            url.set(drivername="postgresql+asyncpg"), pool_pre_ping=True
        )
    return _engine


def create_session() -> AsyncSession | None:
    engine = get_engine()
    return AsyncSession(engine, expire_on_commit=False) if engine else None


async def close_engine() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None
