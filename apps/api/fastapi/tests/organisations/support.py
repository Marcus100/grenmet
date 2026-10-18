from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import create_access_token
from src.organisations import service
from src.organisations.models import (
    MembershipRole,
    OrganisationKind,
    PlatformOrganisation,
)


def headers_for(user: User, organisation_id: str | None = None) -> dict[str, str]:
    token = create_access_token(
        user.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    headers = {"Authorization": f"Bearer {token}"}
    if organisation_id is not None:
        headers["X-Barrels-Organisation"] = organisation_id
    return headers


async def make_org(
    session: AsyncSession,
    name: str,
    *,
    members: tuple[tuple[User, MembershipRole], ...] = (),
) -> PlatformOrganisation:
    organisation = await service.create_organisation(
        session, name=name, kind=OrganisationKind.BUSINESS
    )
    for user, role in members:
        await service.add_member(
            session, organisation_id=organisation.id, user_id=user.id, role=role
        )
    await session.commit()
    return organisation
