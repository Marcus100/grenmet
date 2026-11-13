from typing import Annotated

from fastapi import Depends

from src.auth.models import User
from src.auth.policy import require_permission
from src.dependencies import CurrentUser, get_current_active_superuser

# Superuser only: shared definitions (role bundles, product access) that no single
# organisation can own.
AdminUser = Annotated[User, Depends(get_current_active_superuser)]


def get_hr_setup_user(current_user: CurrentUser) -> User:
    """HR setup holder of ``hr.setup.manage``. The organisation check is per action."""
    require_permission(current_user=current_user, permission_key="hr.setup.manage")
    return current_user


HrSetupUser = Annotated[User, Depends(get_hr_setup_user)]
