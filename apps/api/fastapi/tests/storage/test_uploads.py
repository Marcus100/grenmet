"""Organisation-scoped uploads (F8) against a fake object store.

Signing is real (local, no network); only the network calls (HEAD, DELETE) are
served from an in-memory dict.
"""

from collections.abc import Iterator
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.utils import create_access_token
from src.organisations.models import MembershipRole
from src.storage import service as storage
from src.storage import uploads
from src.storage.config import StorageConfig
from src.storage.models import OrgUpload
from src.storage.service import StorageService
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

UPLOADS = "/api/v1/storage/uploads"


class FakeStore(StorageService):
    def __init__(self) -> None:
        super().__init__(
            StorageConfig(
                STORAGE_ENDPOINT_URL="https://nyc3.digitaloceanspaces.com",
                STORAGE_REGION="nyc3",
                STORAGE_BUCKET="test-space",
                STORAGE_ACCESS_KEY_ID="AKIATESTKEY",
                STORAGE_SECRET_ACCESS_KEY="secretdummy",
            )
        )
        self.objects: dict[str, dict[str, Any]] = {}
        self.deleted: list[str] = []

    def head_object(self, key: str) -> dict[str, Any] | None:
        return self.objects.get(key)

    def delete_object(self, key: str) -> None:
        self.deleted.append(key)
        self.objects.pop(key, None)


@pytest.fixture(autouse=True)
def store(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeStore]:
    fake = FakeStore()
    monkeypatch.setattr(storage, "storage_service", fake)
    yield fake


def _body(**over: Any) -> dict[str, Any]:
    return {
        "app": "events",
        "purpose": "organiser-logo",
        "content_type": "image/png",
        "size_bytes": 1234,
    } | over


def _put(store: FakeStore, ticket: dict[str, Any], *, size: int, content_type: str):
    key = urlparse(ticket["url"]).path.removeprefix("/test-space/")
    store.objects[key] = {"ContentLength": size, "ContentType": content_type}
    return key


async def _owner(db: AsyncSession, name: str = "Alpha"):
    user = await make_user(db)
    org = await make_org(db, name, members=((user, MembershipRole.MEMBER),))
    return user, org


async def test_presign_returns_scoped_key_with_type_and_length_signed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    user, org = await _owner(db_async)
    response = await async_client.post(
        UPLOADS, json=_body(), headers=headers_for(user, org.id)
    )
    assert response.status_code == 201, response.text
    ticket = response.json()
    parsed = urlparse(ticket["url"])
    assert parsed.path.startswith(f"/test-space/org/{org.id}/events/organiser-logo/")
    assert parsed.path.endswith(".png")
    query = parse_qs(parsed.query)
    assert query["X-Amz-SignedHeaders"] == ["content-length;content-type;host"]
    assert int(query["X-Amz-Expires"][0]) <= 900
    assert ticket["headers"] == {"Content-Type": "image/png"}
    assert ticket["max_bytes"] == 2 * 1024 * 1024
    row = await db_async.get(OrgUpload, ticket["id"])
    assert row is not None
    assert (row.status, row.organisation_id, row.created_by_user_id) == (
        "pending",
        org.id,
        user.id,
    )


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"content_type": "image/gif"}, "Only JPEG, PNG and WebP"),
        ({"content_type": "application/pdf"}, "Only JPEG, PNG and WebP"),
        ({"size_bytes": 2 * 1024 * 1024 + 1}, "2 MB limit"),
        ({"purpose": "listing-image", "size_bytes": 5 * 1024 * 1024 + 1}, "5 MB"),
        ({"purpose": "secret-dump"}, "Unknown upload purpose"),
        ({"app": "gaa-admin"}, "does not belong"),
    ],
)
async def test_presign_rejects_disallowed_requests(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    override: dict[str, Any],
    message: str,
):
    user, org = await _owner(db_async)
    response = await async_client.post(
        UPLOADS, json=_body(**override), headers=headers_for(user, org.id)
    )
    assert response.status_code == 422
    assert message in response.json()["detail"]


async def test_size_must_be_positive(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    user, org = await _owner(db_async)
    response = await async_client.post(
        UPLOADS, json=_body(size_bytes=0), headers=headers_for(user, org.id)
    )
    assert response.status_code == 422


async def test_unconfigured_storage_is_503(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        storage,
        "storage_service",
        StorageService(
            StorageConfig(
                STORAGE_ENDPOINT_URL=None,
                STORAGE_BUCKET=None,
                STORAGE_ACCESS_KEY_ID=None,
                STORAGE_SECRET_ACCESS_KEY=None,
            )
        ),
    )
    user, org = await _owner(db_async)
    response = await async_client.post(
        UPLOADS, json=_body(), headers=headers_for(user, org.id)
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "Uploads are not configured"}


async def test_presign_needs_sign_in_header_and_membership(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    user, org = await _owner(db_async)
    outsider = await make_user(db_async)
    assert (await async_client.post(UPLOADS, json=_body())).status_code == 401
    assert (
        await async_client.post(UPLOADS, json=_body(), headers=headers_for(user))
    ).status_code == 400
    denied = await async_client.post(
        UPLOADS, json=_body(), headers=headers_for(outsider, org.id)
    )
    assert denied.status_code == 404


async def test_complete_verifies_object_then_marks_complete(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
):
    user, org = await _owner(db_async)
    headers = headers_for(user, org.id)
    ticket = (await async_client.post(UPLOADS, json=_body(), headers=headers)).json()
    url = f"{UPLOADS}/{ticket['id']}/complete"

    missing = await async_client.post(url, headers=headers)
    assert missing.status_code == 409
    assert "not been uploaded" in missing.json()["detail"]

    _put(store, ticket, size=1234, content_type="image/png")
    done = await async_client.post(url, headers=headers)
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "complete"
    assert body["public_path"] == f"/api/v1/storage/public/{ticket['id']}"
    again = await async_client.post(url, headers=headers)
    assert again.status_code == 200


@pytest.mark.parametrize(
    ("size", "content_type"), [(999, "image/png"), (1234, "image/jpeg")]
)
async def test_complete_rejects_and_deletes_mismatched_object(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    store: FakeStore,
    size: int,
    content_type: str,
):
    user, org = await _owner(db_async)
    headers = headers_for(user, org.id)
    ticket = (await async_client.post(UPLOADS, json=_body(), headers=headers)).json()
    key = _put(store, ticket, size=size, content_type=content_type)
    response = await async_client.post(
        f"{UPLOADS}/{ticket['id']}/complete", headers=headers
    )
    assert response.status_code == 422
    assert store.deleted == [key]
    await db_async.rollback()
    row = await db_async.get(OrgUpload, ticket["id"])
    assert row is not None
    assert row.status == "pending"


async def test_complete_after_expiry_is_409(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
):
    user, org = await _owner(db_async)
    headers = headers_for(user, org.id)
    ticket = (await async_client.post(UPLOADS, json=_body(), headers=headers)).json()
    _put(store, ticket, size=1234, content_type="image/png")
    row = await db_async.get(OrgUpload, ticket["id"])
    assert row is not None
    row.expires_at = utc_now() - timedelta(minutes=1)
    await db_async.commit()
    response = await async_client.post(
        f"{UPLOADS}/{ticket['id']}/complete", headers=headers
    )
    assert response.status_code == 409
    assert "expired" in response.json()["detail"]


async def test_private_read_is_short_lived_and_hides_pending_files(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
):
    user, org = await _owner(db_async)
    headers = headers_for(user, org.id)
    ticket = (await async_client.post(UPLOADS, json=_body(), headers=headers)).json()
    file_url = f"/api/v1/storage/files/{ticket['id']}"
    assert (await async_client.get(file_url, headers=headers)).status_code == 404
    _put(store, ticket, size=1234, content_type="image/png")
    await async_client.post(f"{UPLOADS}/{ticket['id']}/complete", headers=headers)
    response = await async_client.get(file_url, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["expires_in"] <= 300
    query = parse_qs(urlparse(body["url"]).query)
    assert int(query["X-Amz-Expires"][0]) == body["expires_in"]


async def test_no_cross_organisation_reads_or_completes(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
):
    user_a, org_a = await _owner(db_async, "A")
    user_b, org_b = await _owner(db_async, "B")
    headers_a = headers_for(user_a, org_a.id)
    ticket = (await async_client.post(UPLOADS, json=_body(), headers=headers_a)).json()
    _put(store, ticket, size=1234, content_type="image/png")
    await async_client.post(f"{UPLOADS}/{ticket['id']}/complete", headers=headers_a)

    # B, acting for B, cannot see A's file.
    headers_b = headers_for(user_b, org_b.id)
    assert (
        await async_client.get(
            f"/api/v1/storage/files/{ticket['id']}", headers=headers_b
        )
    ).status_code == 404
    assert (
        await async_client.post(f"{UPLOADS}/{ticket['id']}/complete", headers=headers_b)
    ).status_code == 404
    # B cannot claim to act for A either.
    claim = await async_client.get(
        f"/api/v1/storage/files/{ticket['id']}", headers=headers_for(user_b, org_a.id)
    )
    assert claim.status_code == 404


async def test_public_purposes_redirect_without_login_and_are_cacheable(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
):
    user, org = await _owner(db_async)
    headers = headers_for(user, org.id)
    ticket = (await async_client.post(UPLOADS, json=_body(), headers=headers)).json()
    public = f"/api/v1/storage/public/{ticket['id']}"
    assert (
        await async_client.get(public, follow_redirects=False)
    ).status_code == 404  # still pending
    _put(store, ticket, size=1234, content_type="image/png")
    await async_client.post(f"{UPLOADS}/{ticket['id']}/complete", headers=headers)
    response = await async_client.get(public, follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["cache-control"].startswith("public, max-age=")
    assert (
        int(response.headers["cache-control"].rsplit("=", 1)[1])
        < uploads.PUBLIC_REDIRECT_SECONDS
    )
    assert "X-Amz-Signature" in response.headers["location"]


async def test_private_purposes_are_never_public(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    store: FakeStore,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setitem(
        uploads.PURPOSES,
        "member-document",
        uploads.Purpose(app="events", max_bytes=1024 * 1024, public=False),
    )
    user, org = await _owner(db_async)
    headers = headers_for(user, org.id)
    ticket = (
        await async_client.post(
            UPLOADS, json=_body(purpose="member-document"), headers=headers
        )
    ).json()
    _put(store, ticket, size=1234, content_type="image/png")
    done = await async_client.post(
        f"{UPLOADS}/{ticket['id']}/complete", headers=headers
    )
    assert done.json()["public_path"] is None
    public = await async_client.get(
        f"/api/v1/storage/public/{ticket['id']}", follow_redirects=False
    )
    assert public.status_code == 404


async def test_events_scoped_token_uploads_for_events_only(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    user = await user_with_role(db_async, "events-organiser")
    org = await make_org(db_async, "Fete Co", members=((user, MembershipRole.OWNER),))
    token = create_access_token(user.id, timedelta(minutes=5), app="events")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Barrels-Organisation": org.id,
    }
    ok = await async_client.post(UPLOADS, json=_body(), headers=headers)
    assert ok.status_code == 201, ok.text
    # A token for another app cannot upload for events.
    other = create_access_token(user.id, timedelta(minutes=5), app="not-an-app")
    refused = await async_client.post(
        UPLOADS,
        json=_body(),
        headers={"Authorization": f"Bearer {other}", "X-Barrels-Organisation": org.id},
    )
    assert refused.status_code == 401
