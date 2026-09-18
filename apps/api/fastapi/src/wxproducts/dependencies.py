from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.browser import BrowserUser
from src.auth.models import User
from src.baseline import product_access
from src.dependencies import SessionDep
from src.exceptions import AuthorizationError

from . import database
from .exceptions import WeatherUnavailable


async def get_session() -> AsyncGenerator[AsyncSession | None]:
    session = database.create_session()
    if session is None:
        yield None
    else:
        async with session:
            yield session


WxProductsSessionDep = Annotated[AsyncSession | None, Depends(get_session)]


@dataclass
class ProductAuthor:
    user: User
    allowed_kinds: list[str]

    def require_kind(self, kind: str) -> None:
        if kind not in self.allowed_kinds:
            raise AuthorizationError(
                "Your account is not authorized to author GMS products."
            )


async def get_author(user: BrowserUser, session: SessionDep) -> ProductAuthor:
    kinds = await product_access.allowed_kinds(session, user)
    if not kinds:
        raise AuthorizationError(
            "Your account is not authorized to author GMS products."
        )
    return ProductAuthor(user, kinds)


async def require_session(session: WxProductsSessionDep) -> AsyncSession:
    if session is None:
        raise WeatherUnavailable()
    return session


AuthorDep = Annotated[ProductAuthor, Depends(get_author)]
AuthoringSessionDep = Annotated[AsyncSession, Depends(require_session)]
