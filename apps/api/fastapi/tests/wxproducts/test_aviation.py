import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from src.main import app
from src.wxproducts import service
from src.wxproducts.dependencies import ProductAuthor, get_author
from src.wxproducts.exceptions import RevisionConflict
from src.wxproducts.schemas import AviationDraftWrite
from tests.wxproducts.test_authoring import actor as actor
from tests.wxproducts.test_authoring import weather_sessions as weather_sessions
from tests.wxproducts.test_migrations import weather_engine as weather_engine


def payload(**changes):
    return AviationDraftWrite.model_validate(
        dict(
            id=uuid4(),
            expected_revision=0,
            kind="METAR",
            station="TGPY",
            message="METAR TGPY draft=",
            **changes,
        )
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"observed_at": "2026-09-17T12:00:00"},
        {"valid_from": "2026-09-17T12:00:00Z"},
        {"valid_from": "2026-09-17T12:00:00Z", "valid_to": "2026-09-17T11:00:00Z"},
    ],
)
def test_explicit_time_validation(changes):
    with pytest.raises(ValidationError):
        payload(**changes)


async def test_save_history_and_unknown_times(weather_sessions, actor):
    body = payload(observed_at="2026-09-17T08:00:00-04:00")
    async with weather_sessions() as session:
        first = await service.save_aviation_draft(session, body, actor)
        assert first.revision == 1
        assert first.content["observed_at"] == "2026-09-17T12:00:00+0000"
        assert first.content["issued_at"] is None
    async with weather_sessions() as session:
        second = await service.save_aviation_draft(
            session,
            body.model_copy(
                update={"expected_revision": 1, "message": "Revised draft"}
            ),
            actor,
        )
        assert second.revision == 2
    async with weather_sessions() as session:
        history = await service.aviation_history(session, body.id)
        assert [row.revision for row in history] == [2, 1]
        assert history[1].content["message"] == body.message
        assert history[0].actor_id == str(actor.id)
        assert history[0].recorded_at <= datetime.now(UTC)
        assert len(await service.list_aviation_drafts(session, "METAR", "TGPY")) == 1
        assert await service.list_aviation_drafts(session, "TAF", "TGPY") == []
        assert await service.list_aviation_drafts(session, "METAR", "TGPZ") == []


async def test_concurrent_creates_and_updates_conflict(weather_sessions, actor):
    body = payload()

    async def save(item):
        async with weather_sessions() as session:
            try:
                await service.save_aviation_draft(session, item, actor)
                return "saved"
            except RevisionConflict:
                return "conflict"

    assert sorted(await asyncio.gather(save(body), save(body))) == ["conflict", "saved"]
    changed = body.model_copy(update={"expected_revision": 1, "message": "New draft"})
    assert sorted(await asyncio.gather(save(changed), save(changed))) == [
        "conflict",
        "saved",
    ]
    async with weather_sessions() as session:
        assert len(await service.aviation_history(session, body.id)) == 2


async def test_identity_is_fixed(weather_sessions, actor):
    body = payload()
    async with weather_sessions() as session:
        await service.save_aviation_draft(session, body, actor)
    async with weather_sessions() as session:
        with pytest.raises(RevisionConflict):
            await service.save_aviation_draft(
                session,
                body.model_copy(update={"expected_revision": 1, "station": "TGPZ"}),
                actor,
            )


@pytest.mark.usefixtures("weather_sessions")
async def test_http_access_contract_and_public_exclusion(actor):
    author = ProductAuthor(user=actor, allowed_kinds=["aviation"])
    app.dependency_overrides[get_author] = lambda: author
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            body = payload()
            saved = await client.post(
                "/api/v1/wxproducts/aviation/drafts", json=body.model_dump(mode="json")
            )
            assert saved.status_code == 200, saved.text
            assert saved.json()["state"] == "draft"
            assert saved.headers["cache-control"] == "no-store"
            conflict = await client.post(
                "/api/v1/wxproducts/aviation/drafts", json=body.model_dump(mode="json")
            )
            assert conflict.status_code == 409
            listing = await client.get(
                "/api/v1/wxproducts/aviation/drafts?kind=METAR&station=TGPY"
            )
            assert len(listing.json()["drafts"]) == 1
            public = await client.get("/api/v1/wxproducts/public/products")
            assert public.json() == {"products": []}
            author.allowed_kinds = ["marine"]
            assert (
                await client.get(
                    "/api/v1/wxproducts/aviation/drafts?kind=METAR&station=TGPY"
                )
            ).status_code == 403
            assert (
                await client.post(
                    "/api/v1/wxproducts/aviation/drafts",
                    json=body.model_dump(mode="json"),
                )
            ).status_code == 403
            assert (
                await client.get(
                    f"/api/v1/wxproducts/aviation/drafts/{body.id}/history"
                )
            ).status_code == 403
    finally:
        app.dependency_overrides.pop(get_author, None)
