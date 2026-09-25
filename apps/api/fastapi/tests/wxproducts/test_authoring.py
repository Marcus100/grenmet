import asyncio
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.baseline import product_access
from src.main import app
from src.wxproducts import service, validation
from src.wxproducts.dependencies import get_session
from src.wxproducts.exceptions import RevisionConflict
from src.wxproducts.schemas import ProductWrite
from tests.wxproducts.test_migrations import migrate
from tests.wxproducts.test_validation import body, complete


@pytest.fixture
async def weather_sessions(
    weather_engine: Engine,
) -> AsyncGenerator[async_sessionmaker[AsyncSession]]:
    migrate(weather_engine)
    engine = create_async_engine(
        weather_engine.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def override():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = override
    try:
        yield sessions
    finally:
        app.dependency_overrides.pop(get_session, None)
        await engine.dispose()


@pytest.fixture
def actor() -> User:
    return User(
        id=uuid4(),
        email="forecaster@example.test",
        first_name="Duty",
        last_name="Forecaster",
        is_active=True,
        registration_pending=False,
        is_superuser=True,
    )


def current_input(**changes) -> ProductWrite:
    values = complete("marine")
    now = datetime.now(validation.GRENADA)
    values.update(
        issuedAt=(now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M"),
        validFrom=(now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M"),
        validTo=(now + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M"),
    )
    return body(values=values, **changes)


async def test_draft_publish_edit_withdraw_history(weather_sessions, actor):
    payload = current_input(action="draft")
    async with weather_sessions() as session:
        first = await service.write_product(session, payload, actor)
        assert first.revision == 1 and first.published is None
    async with weather_sessions() as session:
        saved = await service.list_authored(
            session, "marine", datetime.now(validation.GRENADA).date()
        )
        # The signed-in actor is recorded as the issuing forecaster.
        assert saved[0].draft["values"] == payload.values | {
            "forecaster": actor.full_name
        }
    async with weather_sessions() as session:
        published = await service.write_product(
            session,
            payload.model_copy(
                update={
                    "action": "publish",
                    "expectedRevision": 1,
                    "changeSummary": "Issued",
                }
            ),
            actor,
        )
        snapshot = published.published
    edited = payload.model_copy(
        update={
            "expectedRevision": 2,
            "values": {**payload.values, "synopsis": "Private edit"},
        }
    )
    async with weather_sessions() as session:
        draft = await service.write_product(session, edited, actor)
        assert draft.revision == 3 and draft.published == snapshot
        public = await service.list_published_products(session, None)
        assert public[0].values["synopsis"] != "Private edit"
    async with weather_sessions() as session:
        withdrawn = await service.write_product(
            session,
            payload.model_copy(
                update={
                    "action": "withdraw",
                    "expectedRevision": 3,
                    "changeSummary": "Correcting issue",
                }
            ),
            actor,
        )
        assert withdrawn.published is None
        assert withdrawn.draft["values"]["synopsis"] == "Private edit"
        assert await service.list_published_products(session, None) == []
        history = await service.history(session, payload.id, ["marine"])
        assert [row.action for row in history] == [
            "withdraw",
            "draft",
            "publish",
            "draft",
        ]
        assert all(row.actor_id == str(actor.id) for row in history)
        assert await service.history(session, payload.id, ["morning"]) == []


@pytest.mark.parametrize("existing", [False, True])
async def test_concurrent_saves_do_not_overwrite(weather_sessions, actor, existing):
    payload = current_input(action="draft")
    if existing:
        async with weather_sessions() as session:
            await service.write_product(session, payload, actor)
        payload = payload.model_copy(update={"expectedRevision": 1})

    async def save():
        async with weather_sessions() as session:
            try:
                await service.write_product(session, payload, actor)
                return "saved"
            except RevisionConflict:
                return "conflict"

    assert sorted(await asyncio.gather(save(), save())) == ["conflict", "saved"]
    async with weather_sessions() as session:
        assert len(await service.history(session, payload.id, ["marine"])) == (
            2 if existing else 1
        )


async def test_history_failure_rolls_back_product(
    weather_sessions, actor, weather_engine
):
    with weather_engine.begin() as connection:
        connection.exec_driver_sql(
            "ALTER TABLE authored_product_revisions ADD CONSTRAINT reject_history CHECK (revision < 0)"
        )
    async with weather_sessions() as session:
        with pytest.raises(IntegrityError):
            await service.write_product(session, current_input(action="draft"), actor)
    async with weather_sessions() as session:
        assert (
            await session.execute(text("SELECT count(*) FROM authored_products"))
        ).scalar_one() == 0


async def test_private_routes_check_access_validate_and_preserve_contract(
    async_client: httpx.AsyncClient, weather_sessions, actor, monkeypatch
):
    assert weather_sessions is not None
    response = await async_client.get(
        "/api/v1/wxproducts/products?kind=marine&issue_date=2026-09-08"
    )
    assert response.status_code == 401
    app.dependency_overrides[get_browser_or_token_user] = lambda: actor
    try:
        payload = current_input(action="draft")
        saved = await async_client.post(
            "/api/v1/wxproducts/products", json=payload.model_dump(mode="json")
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["revision"] == 1
        assert saved.headers["cache-control"] == "no-store"
        stale = await async_client.post(
            "/api/v1/wxproducts/products", json=payload.model_dump(mode="json")
        )
        assert stale.status_code == 409
        invalid = await async_client.post(
            "/api/v1/wxproducts/products",
            json={**payload.model_dump(mode="json"), "actorId": "forged"},
        )
        assert invalid.status_code == 422
        history = await async_client.get(
            f"/api/v1/wxproducts/products/{payload.id}/history"
        )
        assert history.status_code == 200
        assert history.json()["history"][0]["actorName"] == "Duty Forecaster"
        assert "actor_id" not in history.text and "content" not in history.text

        async def allowed(*_args):
            return ["morning"]

        monkeypatch.setattr(product_access, "allowed_kinds", allowed)
        denied = await async_client.post(
            "/api/v1/wxproducts/products", json=payload.model_dump(mode="json")
        )
        assert denied.status_code == 403
        hidden = await async_client.get(
            f"/api/v1/wxproducts/products/{payload.id}/history"
        )
        assert hidden.json() == {"history": []}
        actor.is_active = False
        monkeypatch.undo()
        denied = await async_client.get(
            "/api/v1/wxproducts/products?kind=marine&issue_date=2026-09-08"
        )
        assert denied.status_code == 403
    finally:
        app.dependency_overrides.pop(get_browser_or_token_user, None)
