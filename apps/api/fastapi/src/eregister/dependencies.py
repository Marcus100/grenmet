from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from . import database


async def get_session() -> AsyncGenerator[AsyncSession]:
    session = database.create_session()
    if session is None:
        raise HTTPException(503, "eRegister database is unavailable")
    try:
        async with session:
            yield session
    except (SQLAlchemyError, OSError, TimeoutError) as exc:
        raise HTTPException(503, "eRegister database is unavailable") from exc


RegisterSession = Annotated[AsyncSession, Depends(get_session)]


async def get_public_session() -> AsyncGenerator[AsyncSession | None]:
    """Anonymous reads report an outage in their own shape, so no 503 here."""
    session = database.create_session()
    if session is None:
        yield None
    else:
        async with session:
            yield session


PublicRegisterSession = Annotated[AsyncSession | None, Depends(get_public_session)]
