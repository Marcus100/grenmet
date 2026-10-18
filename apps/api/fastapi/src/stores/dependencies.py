from typing import Annotated

from fastapi import Depends

from src.dependencies import CurrentUser, SessionDep

from . import access


async def get_context(session: SessionDep, current_user: CurrentUser) -> access.Context:
    return await access.context_for(session, current_user)


StoresContext = Annotated[access.Context, Depends(get_context)]
