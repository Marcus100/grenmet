from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.transport.exceptions import TimetableUnavailableError

from . import database


async def get_session() -> AsyncGenerator[AsyncSession]:
    session = database.create_session()
    if session is None:
        raise TimetableUnavailableError()
    try:
        async with session:
            yield session
    except SQLAlchemyError, OSError, TimeoutError:
        raise TimetableUnavailableError() from None


TransportSession = Annotated[AsyncSession, Depends(get_session)]
