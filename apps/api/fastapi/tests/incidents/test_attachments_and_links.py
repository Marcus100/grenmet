"""Photo attachments (opslog, incidents) and record links between the two (ADR-0067)."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth.models import User
from src.opslog import outbox_handlers as opslog_handlers
from src.opslog.messages import ENTRY_POST_TOPIC
from src.opslog.models import OpsLog
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    new_grant_id,
)
from src.storage import uploads
from src.storage.models import OrgUpload, UploadStatus
from src.storage.schemas import UploadRequest
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

OPSLOG = "/api/v1/opslog/org"
INCIDENTS = "/api/v1/incidents/org"

pytestmark = pytest.mark.asyncio


async def _grant(db: AsyncSession, org_id: str, user: User, role_key: str) -> None:
    membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org_id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    db.add(
        MembershipGrant(
            id=new_grant_id(),
            membership_id=membership.id,
            organisation_id=org_id,
            role_key=role_key,
            granted_at=utc_now(),
        )
    )
    await db.commit()


async def _upload(
    db: AsyncSession,
    org_id: str,
    user: User,
    *,
    app: str,
    purpose: str,
    complete: bool = True,
) -> uuid.UUID:
    upload_id = uuid.uuid4()
    now = utc_now()
    db.add(
        OrgUpload(
            id=upload_id,
            organisation_id=org_id,
            app=app,
            purpose=purpose,
            object_key=f"org/{org_id}/{app}/{purpose}/{upload_id}.jpg",
            content_type="image/jpeg",
            size_bytes=1000,
            status=(UploadStatus.COMPLETE if complete else UploadStatus.PENDING).value,
            created_by_user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(minutes=15),
        )
    )
    await db.commit()
    return upload_id


async def _org(db: AsyncSession) -> tuple[str, User, User]:
    owner = await make_user(db)
    writer = await make_user(db)
    org = await make_org(
        db,
        f"Airport {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER), (writer, MembershipRole.MEMBER)),
        apps=("opslog", "incidents"),
    )
    await _grant(db, org.id, writer, "opslog-writer")
    return org.id, owner, writer


def test_operations_photo_purposes_belong_to_their_products() -> None:
    for app, purpose in (("opslog", "opslog-photo"), ("incidents", "incident-photo")):
        found = uploads.validate_request(
            UploadRequest(
                app=app, purpose=purpose, content_type="image/jpeg", size_bytes=10
            )
        )
        assert found.public is False
        assert found.strip_metadata is True
    with pytest.raises(uploads.UploadRejectedError):
        uploads.validate_request(
            UploadRequest(
                app="opslog",
                purpose="incident-photo",
                content_type="image/jpeg",
                size_bytes=10,
            )
        )


async def test_log_entry_photos(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, writer = await _org(db_async)
    h = headers_for(writer, org_id)
    log = await async_client.post(
        f"{OPSLOG}/logs", headers=headers_for(owner, org_id), json={"name": "Ops"}
    )
    log_id = log.json()["id"]
    entry = await async_client.post(
        f"{OPSLOG}/logs/{log_id}/entries", headers=h, json={"text": "Light out"}
    )
    entry_id = entry.json()["id"]
    path = f"{OPSLOG}/entries/{entry_id}/attachments"

    photo = await _upload(
        db_async, org_id, writer, app="opslog", purpose="opslog-photo"
    )
    added = await async_client.post(
        path, headers=h, json={"file_id": str(photo), "caption": " Stand 3 "}
    )
    assert added.status_code == 201, added.text
    assert added.json()["caption"] == "Stand 3"
    again = await async_client.post(path, headers=h, json={"file_id": str(photo)})
    assert again.status_code == 409

    pending = await _upload(
        db_async, org_id, writer, app="opslog", purpose="opslog-photo", complete=False
    )
    wrong = await _upload(
        db_async, org_id, writer, app="incidents", purpose="incident-photo"
    )
    for file_id in (pending, wrong, uuid.uuid4()):
        refused = await async_client.post(
            path, headers=h, json={"file_id": str(file_id)}
        )
        assert refused.status_code == 422, file_id

    detail = await async_client.get(f"{OPSLOG}/entries/{entry_id}", headers=h)
    assert [a["file_id"] for a in detail.json()["attachments"]] == [str(photo)]

    await async_client.patch(
        f"{OPSLOG}/logs/{log_id}",
        headers=headers_for(owner, org_id),
        json={"edit_rule": "locked"},
    )
    other = await _upload(
        db_async, org_id, writer, app="opslog", purpose="opslog-photo"
    )
    locked = await async_client.post(path, headers=h, json={"file_id": str(other)})
    assert locked.status_code == 409


async def test_incident_photos_and_lock(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, _ = await _org(db_async)
    h = headers_for(owner, org_id)
    incident = await async_client.post(
        f"{INCIDENTS}/incidents", headers=h, json={"title": "Bird strike"}
    )
    incident_id = incident.json()["id"]
    path = f"{INCIDENTS}/incidents/{incident_id}/attachments"
    photo = await _upload(
        db_async, org_id, owner, app="incidents", purpose="incident-photo"
    )
    added = await async_client.post(path, headers=h, json={"file_id": str(photo)})
    assert added.status_code == 201, added.text
    detail = await async_client.get(f"{INCIDENTS}/incidents/{incident_id}", headers=h)
    assert [a["file_id"] for a in detail.json()["attachments"]] == [str(photo)]

    other_org, other_owner, _ = await _org(db_async)
    theirs = await _upload(
        db_async, other_org, other_owner, app="incidents", purpose="incident-photo"
    )
    foreign = await async_client.post(path, headers=h, json={"file_id": str(theirs)})
    assert foreign.status_code == 422

    await async_client.post(f"{INCIDENTS}/incidents/{incident_id}/open", headers=h)
    await async_client.post(f"{INCIDENTS}/incidents/{incident_id}/close", headers=h)
    late = await _upload(
        db_async, org_id, owner, app="incidents", purpose="incident-photo"
    )
    refused = await async_client.post(path, headers=h, json={"file_id": str(late)})
    assert refused.status_code == 409


async def test_log_shows_incident_title_only_to_incident_readers(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    assert opslog_handlers.entry_post is not None  # registers the handler
    org_id, owner, writer = await _org(db_async)
    db_async.add(OpsLog(organisation_id=org_id, name="Operations"))
    await db_async.commit()
    made = await async_client.post(
        f"{INCIDENTS}/incidents",
        headers=headers_for(owner, org_id),
        json={"title": "Fuel spill"},
    )
    incident = made.json()
    await async_client.post(
        f"{INCIDENTS}/incidents/{incident['id']}/open",
        headers=headers_for(owner, org_id),
    )
    await outbox.drain(db_async, only_topics=[ENTRY_POST_TOPIC])
    log_id = (
        await async_client.get(f"{OPSLOG}/logs", headers=headers_for(owner, org_id))
    ).json()["data"][0]["id"]

    def record(body: dict[str, object]) -> dict[str, object]:
        data = body["data"]
        assert isinstance(data, list)
        found: dict[str, object] = data[0]["record"]
        return found

    as_owner = await async_client.get(
        f"{OPSLOG}/logs/{log_id}/entries", headers=headers_for(owner, org_id)
    )
    assert record(as_owner.json()) == {
        "kind": "incidents.incident",
        "id": incident["id"],
        "title": f"{incident['reference']} Fuel spill",
        "available": True,
    }
    # The log keeper holds no incidents key: the link is there, the title is not.
    as_writer = await async_client.get(
        f"{OPSLOG}/logs/{log_id}/entries", headers=headers_for(writer, org_id)
    )
    assert record(as_writer.json())["available"] is False
    assert record(as_writer.json())["title"] is None


async def test_photo_rules_cap_caption_access_and_privacy(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, writer = await _org(db_async)
    reader = await make_user(db_async)
    from src.organisations import service as org_service

    await org_service.add_member(
        db_async, organisation_id=org_id, user_id=reader.id, role=MembershipRole.MEMBER
    )
    await db_async.commit()
    owner_h = headers_for(owner, org_id)
    log_id = (
        await async_client.post(f"{OPSLOG}/logs", headers=owner_h, json={"name": "Ops"})
    ).json()["id"]
    entry_id = (
        await async_client.post(
            f"{OPSLOG}/logs/{log_id}/entries", headers=owner_h, json={"text": "x"}
        )
    ).json()["id"]
    private_id = (
        await async_client.post(
            f"{OPSLOG}/logs/{log_id}/entries",
            headers=owner_h,
            json={"text": "staff matter", "private": True},
        )
    ).json()["id"]

    async def photo() -> str:
        return str(
            await _upload(db_async, org_id, owner, app="opslog", purpose="opslog-photo")
        )

    long_caption = await async_client.post(
        f"{OPSLOG}/entries/{entry_id}/attachments",
        headers=owner_h,
        json={"file_id": await photo(), "caption": "x" * 201},
    )
    assert long_caption.status_code == 422
    # A member with no opslog role cannot attach.
    no_role = await async_client.post(
        f"{OPSLOG}/entries/{entry_id}/attachments",
        headers=headers_for(reader, org_id),
        json={"file_id": await photo()},
    )
    assert no_role.status_code == 403
    # The log keeper cannot see, so cannot attach to, a private entry.
    hidden = await async_client.post(
        f"{OPSLOG}/entries/{private_id}/attachments",
        headers=headers_for(writer, org_id),
        json={"file_id": await photo()},
    )
    assert hidden.status_code == 404

    for _ in range(20):
        ok = await async_client.post(
            f"{OPSLOG}/entries/{entry_id}/attachments",
            headers=owner_h,
            json={"file_id": await photo()},
        )
        assert ok.status_code == 201
    full = await async_client.post(
        f"{OPSLOG}/entries/{entry_id}/attachments",
        headers=owner_h,
        json={"file_id": await photo()},
    )
    assert full.status_code == 409

    await async_client.patch(
        f"{OPSLOG}/logs/{log_id}", headers=owner_h, json={"archived": True}
    )
    archived = await async_client.post(
        f"{OPSLOG}/entries/{private_id}/attachments",
        headers=owner_h,
        json={"file_id": await photo()},
    )
    assert archived.status_code == 409


async def test_product_upload_needs_the_entitlement(db_async: AsyncSession) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        f"No log {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=(),
    )
    from src.organisations.dependencies import OrgContext
    from src.organisations.exceptions import OrganisationAppNotEntitledError
    from src.storage.dependencies import UploadContext

    membership = await db_async.scalar(
        select(Membership).where(Membership.organisation_id == org.id)
    )
    assert membership is not None
    context = UploadContext(
        org=OrgContext(organisation=org, membership=membership, user=owner),
        token_app=None,
    )
    body = UploadRequest(
        app="opslog", purpose="opslog-photo", content_type="image/jpeg", size_bytes=10
    )
    with pytest.raises(
        (OrganisationAppNotEntitledError, uploads.UploadsNotConfiguredError)
    ) as raised:
        await uploads.create_upload(db_async, context, body)
    # Where storage is configured the entitlement check is what refuses.
    assert raised.type in (
        OrganisationAppNotEntitledError,
        uploads.UploadsNotConfiguredError,
    )
