"""Shared organiser test helpers and fixtures (ADR-0060 organiser amendment).

Imported by the organiser read and write test modules. The autouse TOTP key fixture
and the ``world`` fixture come along with the helpers they use."""

from datetime import timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth import totp
from src.auth.models import Role, User, UserRoleLink
from src.auth.permissions import seed_permissions_and_roles_async
from src.auth.utils import create_access_token
from src.config import settings
from src.organisations import service as org_service
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    PlatformOrganisation,
    new_grant_id,
)
from src.printix.models import PrintixEvent
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import make_org

from .support import make_event

ORG = f"{settings.API_V1_STR}/printix/org"
ME = f"{settings.API_V1_STR}/printix/me/organisations"


async def _enrol(db: AsyncSession, user: User) -> None:
    user.totp_secret = totp.encrypt_secret(totp.generate_secret())
    user.totp_enabled = True
    await db.commit()


async def _app_user(db: AsyncSession, *, enrolled: bool = True) -> User:
    """An ordinary account holding the printix-member role (app.printix.access)."""
    await seed_permissions_and_roles_async(db)
    user = await make_user(db)
    role = await db.scalar(select(Role).where(Role.name == "printix-member"))
    assert role is not None
    db.add(UserRoleLink(user_id=user.id, role_id=role.id))
    await db.commit()
    if enrolled:
        await _enrol(db, user)
    return user


async def _grant(
    db: AsyncSession, org: PlatformOrganisation, user: User, role_key: str
) -> None:
    membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    db.add(
        MembershipGrant(
            id=new_grant_id(),
            membership_id=membership.id,
            organisation_id=org.id,
            role_key=role_key,
            granted_at=utc_now(),
        )
    )
    await db.commit()


async def _sign_in(
    db: AsyncSession,
    user: User,
    *,
    app: str | None = "printix",
    mfa: bool = True,
) -> dict[str, str]:
    """A bearer for a session of ``app`` (None: the account), MFA-verified when ``mfa``."""
    stored, _ = await auth_service.create_session(
        session=db,
        user=user,
        app_name=app,
        enforce_approval=False,
        mfa_verified_at=utc_now() if mfa else None,
    )
    token = create_access_token(
        user.id, timedelta(minutes=5), app=app, session_id=str(stored.id)
    )
    return {"Authorization": f"Bearer {token}"}


async def _organiser(
    db: AsyncSession, org: PlatformOrganisation, role_key: str | None
) -> User:
    """An account with app access, a plain member of ``org``, and ``role_key`` if given."""
    user = await _app_user(db)
    await make_org_member(db, org, user)
    if role_key is not None:
        await _grant(db, org, user, role_key)
    return user


async def make_org_member(
    db: AsyncSession, org: PlatformOrganisation, user: User
) -> Membership:
    await org_service.add_member(
        db, organisation_id=org.id, user_id=user.id, role=MembershipRole.MEMBER
    )
    await db.commit()
    membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    return membership


async def _org(
    db: AsyncSession, name: str, *, entitled: bool = True
) -> PlatformOrganisation:
    return await make_org(db, name, apps=("printix",) if entitled else ())


async def _event(
    db: AsyncSession, name: str, org: PlatformOrganisation | None
) -> PrintixEvent:
    event = await make_event(db, name=name)
    event.organisation_id = org.id if org is not None else None
    await db.commit()
    return event


def _org_header(org: PlatformOrganisation) -> dict[str, str]:
    return {"X-Barrels-Organisation": org.id}


def _ids(response: httpx.Response) -> set[str]:
    return {item["id"] for item in response.json()["items"]}
