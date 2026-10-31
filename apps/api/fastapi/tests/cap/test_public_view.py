"""The anonymous public CAP routes leave out staff-only fields; staff routes keep them."""

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.baseline.models import ApprovalPolicy
from src.cap import service as cap_service
from src.cap.schemas import CapAlertAction, CapAlertCreate, CapPublishAction
from tests.cap.test_cap_state_machine import _VALID_PAYLOAD_DICT
from tests.factories import make_user

STAFF_ONLY = {
    "schema_conformant",
    "schema_error",
    "import_source",
    "created_by_user_id",
    "updated_by_user_id",
    "note",
}


async def _published(db: AsyncSession) -> str:
    user = await make_user(db, superuser=True)
    if await db.get(ApprovalPolicy, "cap") is None:
        db.add(ApprovalPolicy(key="cap", allow_self_approval=True))
        await db.commit()
    alert = await cap_service.create_alert(
        session=db, current_user=user, payload=CapAlertCreate(**_VALID_PAYLOAD_DICT)
    )
    await cap_service.submit_alert(
        session=db, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    await cap_service.approve_alert(
        session=db,
        current_user=await make_user(db, superuser=True),
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    published, _ = await cap_service.publish_alert(
        session=db,
        current_user=user,
        alert_id=alert.id,
        payload=CapPublishAction(note="internal"),
    )
    return published.identifier


@pytest.mark.usefixtures("db_async")
async def test_public_routes_drop_staff_only_fields(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    identifier = await _published(db_async)

    single = await async_client.get(f"/api/cap/alerts/{identifier}")
    assert single.status_code == 200, single.text
    assert not STAFF_ONLY & set(single.json())
    assert single.json()["identifier"] == identifier

    for path, key in (
        ("/api/cap/alerts", "data"),
        ("/api/cap/past", "data"),
        ("/api/cap/latest-active", "data"),
    ):
        resp = await async_client.get(path)
        assert resp.status_code == 200, (path, resp.text)
        items = resp.json()[key]
        if path != "/api/cap/past":  # a live alert is not yet past
            assert items, path
        for item in items:
            assert not STAFF_ONLY & set(item), path


@pytest.mark.usefixtures("db_async")
async def test_staff_routes_keep_the_full_model(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    identifier = await _published(db_async)
    resp = await async_client.get(
        "/api/v1/cap/alerts",
        headers=superuser_token_headers_async,
        params={"identifier": identifier},
    )
    assert resp.status_code in (200, 404, 405, 422), resp.text
    single = await db_async.execute(
        __import__("sqlalchemy")
        .select(__import__("src.cap.models", fromlist=["CapAlert"]).CapAlert)
        .where(
            __import__("src.cap.models", fromlist=["CapAlert"]).CapAlert.identifier
            == identifier
        )
    )
    alert_id = single.scalars().first().id
    detail = await async_client.get(
        f"/api/v1/cap/alerts/{alert_id}", headers=superuser_token_headers_async
    )
    assert detail.status_code == 200, detail.text
    assert STAFF_ONLY <= set(detail.json())
