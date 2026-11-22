"""The webhook-disabled notice never goes to an address with no account (issue 1629).

The admin list is read from accounts, but an address can still reach the notice
through the recipient list (for example after its account was erased). Such an
address is skipped; the notice is queued for every address with an account.
"""

import uuid

import pytest
from sqlalchemy import cast, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import String

from src.organisations.models import MembershipRole
from src.outbox import Outbox
from src.webhooks_out import service
from src.webhooks_out.models import EndpointStatus, WebhookEndpoint
from tests.factories import make_user
from tests.organisations.support import make_org


async def _queued_to(db: AsyncSession, address: str) -> int:
    rows = await db.scalars(
        select(Outbox.id).where(cast(Outbox.payload, String).contains(address))
    )
    return len(list(rows.all()))


@pytest.mark.usefixtures("db_async")
async def test_disable_notice_skips_an_address_with_no_account(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = uuid.uuid4().hex[:10]
    ghost = f"erased-{token}@example.com"
    real = f"admin-{token}@example.com"
    user = await make_user(db_async, email=real)
    org = await make_org(
        db_async, f"Hook {token}", members=((user, MembershipRole.ADMIN),)
    )
    endpoint = WebhookEndpoint(
        id=f"wh_{token}",
        organisation_id=org.id,
        url="https://example.test/hook",
        event_types=[],
        secret_encrypted="x",
        status=EndpointStatus.ACTIVE.value,
        consecutive_failures=0,
    )
    db_async.add(endpoint)
    await db_async.commit()

    async def recipients(_session: AsyncSession, _org_id: str) -> list[str]:
        return [ghost, real]

    monkeypatch.setattr(service, "_admin_emails", recipients)

    await service.disable_endpoint(db_async, endpoint, reason="test")
    await db_async.commit()

    assert await _queued_to(db_async, ghost) == 0
    assert await _queued_to(db_async, real) == 1
