from typing import Annotated

from fastapi import Depends

from src.auth.models import User
from src.dependencies import (
    get_current_active_superuser as get_current_active_superuser,
)
from src.dependencies import (
    get_current_user,
)

CurrentActiveUser = Annotated[User, Depends(get_current_user)]
CurrentSuperUser = Annotated[User, Depends(get_current_active_superuser)]
