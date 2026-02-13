from typing import Annotated

from fastapi import Depends, HTTPException

from src.auth.constants import ERROR_INSUFFICIENT_PRIVILEGES
from src.auth.models import User
from src.dependencies import CurrentUser, get_current_user


def get_current_active_superuser(current_user: CurrentUser) -> User:
    """Get current active superuser dependency."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail=ERROR_INSUFFICIENT_PRIVILEGES)
    return current_user


CurrentActiveUser = Annotated[User, Depends(get_current_user)]
CurrentSuperUser = Annotated[User, Depends(get_current_active_superuser)]
