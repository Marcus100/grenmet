from typing import Annotated

from fastapi import Depends

from src.auth.models import User
from src.dependencies import get_current_active_superuser

AdminUser = Annotated[User, Depends(get_current_active_superuser)]
