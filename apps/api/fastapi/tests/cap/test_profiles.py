"""Real PostgreSQL persistence in a rollback-only transaction; no shared-data cleanup."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

from src.auth.models import User
from src.cap import profiles
from src.cap.exceptions import CapStateError, CapValidationFailedError
from src.cap.models import CapHazardProfile
from src.cap.profile_schemas import (
    CapProfileDefinition,
    CapProfileDraftRequest,
    CapProfileSave,
)
from src.database import async_engine
from src.exceptions import AuthorizationError


@pytest.fixture
async def profile_session() -> AsyncIterator[AsyncSession]:
    async with async_engine.connect() as connection:
        transaction = await connection.begin()
        await connection.run_sync(
            lambda conn: SQLModel.metadata.create_all(
                conn, tables=[CapHazardProfile.__table__]
            )
        )
        async with AsyncSession(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        ) as session:
            yield session
        await transaction.rollback()


def definition(complete: bool = False) -> CapProfileDefinition:
    return CapProfileDefinition.model_validate(
        {
            "name": "Flood",
            "family": "Heavy rain and flooding",
            "subtypes": [
                {
                    "name": "Flash Flood",
                    "rules": [
                        {
                            "level": "Warning",
                            "metric": "Reported rapid flooding",
                            "operator": "observed",
                            "area": "Test catchment",
                            "evidence": "Test exercise observation",
                        }
                    ]
                    if complete
                    else [],
                    "impacts": ["Test impact"] if complete else [],
                    "responses": ["Test response"] if complete else [],
                    "affected_groups": ["Test audience"] if complete else [],
                }
            ],
            "templates": [
                {
                    "level": "Warning",
                    "headline": "Exercise flood warning",
                    "description": "Exercise only",
                    "instruction": "Exercise response",
                }
            ],
            "issuing_authority": "Test issuer" if complete else "",
            "reviewing_authority": "Test reviewer" if complete else "",
            "channels": ["CAP feed"] if complete else [],
        }
    )


async def test_versions_survive_reload_and_detect_conflicting_edits(
    profile_session: AsyncSession,
) -> None:
    author = User(id=uuid.uuid4(), is_superuser=True)
    key = f"test-{uuid.uuid4().hex}"
    first = await profiles.save_version(
        profile_session, author, key, CapProfileSave(definition=definition())
    )
    assert first.state == "DRAFT"
    assert first.approval_errors
    with pytest.raises(CapStateError):
        await profiles.save_version(
            profile_session, author, key, CapProfileSave(definition=definition())
        )
    second = await profiles.save_version(
        profile_session,
        author,
        key,
        CapProfileSave(base_version=1, definition=definition(True)),
    )
    assert second.version == 2
    assert second.approval_errors == []
    profile_session.expunge_all()
    saved = [
        v for v in await profiles.list_versions(profile_session, author) if v.key == key
    ]
    assert [v.version for v in saved] == [2, 1]
    assert saved[1].definition.issuing_authority == ""


async def test_approval_requires_complete_profile_and_independent_reviewer(
    profile_session: AsyncSession,
) -> None:
    author = User(id=uuid.uuid4(), is_superuser=True)
    reviewer = User(id=uuid.uuid4(), is_superuser=True)
    first = await profiles.save_version(
        profile_session,
        author,
        f"test-{uuid.uuid4().hex}",
        CapProfileSave(definition=definition()),
    )
    with pytest.raises(CapValidationFailedError):
        await profiles.approve(profile_session, reviewer, first.id)
    with pytest.raises(CapStateError):
        await profiles.create_draft(
            profile_session,
            author,
            first.id,
            CapProfileDraftRequest(subtype="Flash Flood", level="Warning"),
        )
    complete = await profiles.save_version(
        profile_session,
        author,
        first.key,
        CapProfileSave(base_version=1, definition=definition(True)),
    )
    with pytest.raises(AuthorizationError):
        await profiles.approve(profile_session, author, complete.id)
    approved = await profiles.approve(profile_session, reviewer, complete.id)
    assert approved.approved_by == reviewer.id
    assert approved.state == "APPROVED"
    assert approved.approved_at is not None
    newer = await profiles.save_version(
        profile_session,
        author,
        first.key,
        CapProfileSave(base_version=2, definition=definition(True)),
    )
    assert newer.state == "DRAFT"
    assert newer.approved_by is None


async def test_profile_write_requires_management_permission(
    profile_session: AsyncSession,
) -> None:
    with pytest.raises(AuthorizationError):
        await profiles.save_version(
            profile_session,
            User(id=uuid.uuid4()),
            "forbidden",
            CapProfileSave(definition=definition()),
        )


def test_numeric_and_per_level_rules_require_complete_evidence() -> None:
    data = definition(True).model_dump()
    data["subtypes"][0]["rules"][0]["operator"] = ">="
    result = profiles.approval_errors(CapProfileDefinition.model_validate(data))
    assert any("threshold, unit and duration" in error for error in result)
    data["templates"].append(
        {
            "level": "Watch",
            "headline": "Watch",
            "description": "Test",
            "instruction": "Test",
        }
    )
    assert any(
        "rule for Watch" in error
        for error in profiles.approval_errors(CapProfileDefinition.model_validate(data))
    )


async def test_approved_profile_starts_only_a_draft_with_version_provenance(
    profile_session: AsyncSession,
) -> None:
    from sqlmodel import select

    from src.cap.models import CapJobEvent, CapLifecycleState, CapSeverity
    from tests.factories import make_user

    author = await make_user(profile_session, superuser=True)
    reviewer = await make_user(profile_session, superuser=True)
    saved = await profiles.save_version(
        profile_session,
        author,
        f"test-{uuid.uuid4().hex}",
        CapProfileSave(definition=definition(True)),
    )
    await profiles.approve(profile_session, reviewer, saved.id)
    alert = await profiles.create_draft(
        profile_session,
        author,
        saved.id,
        CapProfileDraftRequest(subtype="Flash Flood", level="Warning"),
    )
    assert alert.lifecycle_state == CapLifecycleState.DRAFT
    assert alert.info[0].event == "Flash Flood Warning"
    assert alert.info[0].severity == CapSeverity.UNKNOWN
    assert alert.info[0].sender_name == "Test issuer"
    assert alert.info[0].parameters[0].value == f"{saved.key}:v1"
    jobs = await profile_session.execute(
        select(CapJobEvent).where(CapJobEvent.alert_id == alert.id)
    )
    assert list(jobs.scalars()) == []
    with pytest.raises(CapValidationFailedError):
        await profiles.create_draft(
            profile_session,
            author,
            saved.id,
            CapProfileDraftRequest(subtype="Earthquake", level="Warning"),
        )


async def test_profile_http_contract(profile_session: AsyncSession) -> None:
    import httpx
    from fastapi import FastAPI

    from src.cap.profile_router import router
    from src.dependencies import get_current_user, get_db

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/cap")
    author = User(id=uuid.uuid4(), is_superuser=True)
    app.dependency_overrides[get_current_user] = lambda: author
    app.dependency_overrides[get_db] = lambda: profile_session
    key = f"test-{uuid.uuid4().hex}"
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            f"/api/v1/cap/hazard-profiles/{key}/versions",
            json={
                "base_version": 0,
                "definition": definition().model_dump(mode="json"),
            },
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["state"] == "DRAFT"
        assert body["approval_errors"]
        assert body["created_at"].endswith("+0000")
        listed = await client.get("/api/v1/cap/hazard-profiles")
        assert listed.status_code == 200
        assert any(row["id"] == body["id"] for row in listed.json())
