"""Shared helpers for the outbound webhook tests."""

from collections.abc import Callable
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import MembershipRole
from src.webhooks_out import delivery, ssrf
from tests.factories import make_user
from tests.organisations.support import make_org

PUBLIC_IP = "93.184.216.34"
URL = "/api/v1/webhooks-out"
RECEIVER = "https://hooks.example.com/barrels"

Handler = Callable[[httpx.Request], httpx.Response]


class Receiver:
    """Records every request the delivery client makes and answers with ``handler``."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.requests: list[httpx.Request] = []
        self.handler: Handler = lambda _: httpx.Response(200)

        def respond(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            return self.handler(request)

        monkeypatch.setattr(
            delivery,
            "_client",
            lambda: httpx.AsyncClient(
                transport=httpx.MockTransport(respond), follow_redirects=False
            ),
        )


class Resolver:
    """Stands in for DNS: unknown hosts resolve to a public address."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.answers: dict[str, list[str]] = {}

        async def resolve(host: str) -> list[str]:
            return self.answers.get(host, [PUBLIC_IP])

        monkeypatch.setattr(ssrf, "resolve_host", resolve)


async def setup_org(
    db: AsyncSession, name: str = "Hooks Co", apps: tuple[str, ...] = ("webhooks",)
) -> tuple[Any, Any]:
    admin = await make_user(db)
    org = await make_org(db, name, members=((admin, MembershipRole.ADMIN),), apps=apps)
    return admin, org
