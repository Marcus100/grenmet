"""Profile photos (#1303): processing, who may see and remove them, account deletion."""

import io
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import service as auth_service
from src.auth.models import RoleAssignmentScope, UserImage
from src.organisations.models import MembershipRole
from src.profile_images import images
from src.profile_images.exceptions import ProfileImageInvalidError
from src.storage import service as storage
from src.storage.config import StorageConfig
from src.storage.service import StorageService
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)
from tests.organisations.support import headers_for, make_org

URL = "/api/v1/profile-images"
EXIF_GPS = 0x8825
EXIF_ORIENTATION = 0x0112


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
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []

    def put_object(
        self, key: str, data: bytes, *, content_type: str | None = None
    ) -> None:
        assert content_type == "image/webp"
        self.objects[key] = data

    def delete_object(self, key: str) -> None:
        self.deleted.append(key)
        self.objects.pop(key, None)


@pytest.fixture(autouse=True)
def store(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeStore]:
    fake = FakeStore()
    monkeypatch.setattr(storage, "storage_service", fake)
    yield fake


def _jpeg(size: tuple[int, int] = (300, 200), **save: Any) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, "teal").save(buffer, format="JPEG", **save)
    return buffer.getvalue()


def _jpeg_with_gps_and_rotation() -> bytes:
    exif = Image.Exif()
    exif[EXIF_ORIENTATION] = 6  # rotate 90 degrees on display
    exif[EXIF_GPS] = {1: "N", 2: (12.0, 3.0, 0.0)}
    return _jpeg((300, 200), exif=exif.tobytes())


# --- processing ---------------------------------------------------------------


def test_photos_become_square_webp_sizes_without_metadata() -> None:
    sizes = images.process(_jpeg_with_gps_and_rotation())
    assert sorted(sizes) == list(images.SIZES)
    for size, data in sizes.items():
        with Image.open(io.BytesIO(data)) as out:
            assert out.format == "WEBP"
            assert out.size == (size, size)
            assert EXIF_GPS not in out.getexif()
            assert not out.info.get("exif")


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        (b"not an image", "JPEG, PNG or WebP"),
        (_jpeg((20, 20)), "at least 32 pixels"),
        (b"x" * (images.MAX_BYTES + 1), "5 MB"),
    ],
)
def test_unusable_uploads_are_refused(raw: bytes, message: str) -> None:
    with pytest.raises(ProfileImageInvalidError, match=message):
        images.process(raw)


def test_a_gif_is_refused() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64)).save(buffer, format="GIF")
    with pytest.raises(ProfileImageInvalidError, match="JPEG, PNG or WebP"):
        images.process(buffer.getvalue())


# --- your own photo -----------------------------------------------------------


async def test_upload_replace_and_remove_your_photo(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
) -> None:
    user = await make_user(db_async)
    headers = headers_for(user)

    assert (await async_client.get(f"{URL}/me", headers=headers)).status_code == 404

    first = await async_client.put(
        f"{URL}/me", content=_jpeg(), headers={**headers, "content-type": "image/jpeg"}
    )
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["sizes"] == [64, 256, 512]
    first_keys = set(store.objects)
    assert len(first_keys) == 3
    assert all(key.startswith(f"users/{user.id}/profile-image/") for key in first_keys)

    second = await async_client.put(
        f"{URL}/me", content=_jpeg(), headers={**headers, "content-type": "image/jpeg"}
    )
    assert second.json()["version"] != body["version"]
    assert set(store.deleted) == first_keys
    assert len(store.objects) == 3

    gone = await async_client.delete(f"{URL}/me", headers=headers)
    assert gone.status_code == 204
    assert store.objects == {}
    assert (await async_client.get(f"{URL}/me", headers=headers)).status_code == 404


async def test_a_bad_upload_answers_422_and_stores_nothing(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
) -> None:
    user = await make_user(db_async)
    response = await async_client.put(
        f"{URL}/me",
        content=b"plain text",
        headers={**headers_for(user), "content-type": "image/jpeg"},
    )
    assert response.status_code == 422
    assert "JPEG, PNG or WebP" in response.json()["detail"]
    assert store.objects == {}


async def test_other_content_types_answer_415(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
) -> None:
    user = await make_user(db_async)
    response = await async_client.put(
        f"{URL}/me",
        content=_jpeg(),
        headers={**headers_for(user), "content-type": "multipart/form-data"},
    )
    assert response.status_code == 415
    assert store.objects == {}


async def test_an_oversized_body_answers_413_before_processing(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
) -> None:
    user = await make_user(db_async)
    response = await async_client.put(
        f"{URL}/me",
        content=b"x" * (images.MAX_BYTES + 1),
        headers={**headers_for(user), "content-type": "image/png"},
    )
    assert response.status_code == 413
    assert store.objects == {}


async def test_without_storage_uploads_answer_503(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(storage, "storage_service", StorageService(StorageConfig()))
    user = await make_user(db_async)
    response = await async_client.put(
        f"{URL}/me",
        content=_jpeg(),
        headers={**headers_for(user), "content-type": "image/jpeg"},
    )
    assert response.status_code == 503


# --- who may see a photo ------------------------------------------------------


async def _with_photo(client: httpx.AsyncClient, session: AsyncSession) -> Any:
    owner = await make_user(session)
    response = await client.put(
        f"{URL}/me",
        content=_jpeg(),
        headers={**headers_for(owner), "content-type": "image/jpeg"},
    )
    assert response.status_code == 200
    return owner


async def test_people_in_the_same_platform_organisation_see_the_photo(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner = await _with_photo(async_client, db_async)
    colleague = await make_user(db_async)
    await make_org(
        db_async,
        "Synthetic Org",
        members=((owner, MembershipRole.MEMBER), (colleague, MembershipRole.MEMBER)),
    )
    response = await async_client.get(
        f"{URL}/org/{owner.id}", headers=headers_for(colleague), params={"size": 64}
    )
    assert response.status_code == 307
    assert "/64.webp" in response.headers["location"]
    assert response.headers["cache-control"] == "private, max-age=240"


async def test_people_employed_by_the_same_hr_organisation_see_the_photo(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner = await _with_photo(async_client, db_async)
    colleague = await make_user(db_async)
    department = await make_department(db_async)
    await make_employee(db_async, user=owner, department_id=department.id)
    await make_employee(db_async, user=colleague, department_id=department.id)
    response = await async_client.get(
        f"{URL}/org/{owner.id}", headers=headers_for(colleague)
    )
    assert response.status_code == 307
    assert "/256.webp" in response.headers["location"]


async def test_outsiders_get_the_same_404_as_no_photo(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner = await _with_photo(async_client, db_async)
    without_photo = await make_user(db_async)
    stranger = await make_user(db_async)
    hidden = await async_client.get(
        f"{URL}/org/{owner.id}", headers=headers_for(stranger)
    )
    absent = await async_client.get(
        f"{URL}/org/{without_photo.id}", headers=headers_for(stranger)
    )
    assert hidden.status_code == absent.status_code == 404
    assert hidden.json() == absent.json()
    assert hidden.headers["cache-control"] == absent.headers["cache-control"]
    assert absent.headers["cache-control"] == "private, max-age=60"


async def test_you_and_superusers_always_see_it(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner = await _with_photo(async_client, db_async)
    admin = await make_user(db_async, superuser=True)
    for viewer in (owner, admin):
        response = await async_client.get(
            f"{URL}/org/{owner.id}", headers=headers_for(viewer)
        )
        assert response.status_code == 307


async def test_only_the_stored_sizes_can_be_asked_for(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner = await _with_photo(async_client, db_async)
    response = await async_client.get(
        f"{URL}/org/{owner.id}", headers=headers_for(owner), params={"size": 100}
    )
    assert response.status_code == 422


# --- staff removal ------------------------------------------------------------


async def test_hr_removes_an_unsuitable_photo_and_it_is_audited(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
) -> None:
    owner = await _with_photo(async_client, db_async)
    department = await make_department(db_async)
    await make_employee(db_async, user=owner, department_id=department.id)
    hr = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "hr.employment.manage")
    await assign_role(db_async, user=hr, role=role, scope=RoleAssignmentScope.ALL)

    response = await async_client.delete(
        f"{URL}/org/{owner.id}", headers=headers_for(hr)
    )
    assert response.status_code == 204
    assert store.objects == {}
    assert (
        await db_async.scalar(select(UserImage).where(UserImage.user_id == owner.id))
        is None
    )
    history = (
        await db_async.scalars(
            select(AuditEntry).where(AuditEntry.record_type == "profile_image")
        )
    ).all()
    assert any(entry.entity_id == str(owner.id) for entry in history)


async def test_colleagues_without_hr_rights_cannot_remove_a_photo(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
) -> None:
    owner = await _with_photo(async_client, db_async)
    colleague = await make_user(db_async)
    await make_org(
        db_async,
        "Synthetic Org",
        members=((owner, MembershipRole.MEMBER), (colleague, MembershipRole.ADMIN)),
    )
    response = await async_client.delete(
        f"{URL}/org/{owner.id}", headers=headers_for(colleague)
    )
    assert response.status_code == 403
    assert len(store.objects) == 3


# --- account deletion ---------------------------------------------------------


async def test_deleting_the_account_removes_the_photo(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
) -> None:
    owner = await _with_photo(async_client, db_async)
    owner_id = owner.id
    await auth_service.delete_user(session=db_async, user=owner)
    assert store.objects == {}
    assert (
        await db_async.scalar(select(UserImage).where(UserImage.user_id == owner_id))
        is None
    )


async def test_the_hr_profile_links_to_the_photo(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner = await _with_photo(async_client, db_async)
    department = await make_department(db_async)
    await make_employee(db_async, user=owner, department_id=department.id)
    mine = await async_client.get(f"{URL}/me", headers=headers_for(owner))
    profile = await async_client.get(
        "/api/v1/hr/profile/me", headers=headers_for(owner)
    )
    assert profile.status_code == 200, profile.text
    assert profile.json()["identity"]["avatar_url"] == (
        f"/api/v1/profile-images/org/{owner.id}?size=256&v={mine.json()['version']}"
    )


async def _hr_over(session: AsyncSession, department_id: str) -> Any:
    hr = await make_user(session)
    role, _ = await make_role_with_permission(session, "hr.employment.manage")
    await assign_role(
        session,
        user=hr,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department_id,
    )
    return hr


async def test_department_hr_removes_only_within_their_department(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
) -> None:
    owner = await _with_photo(async_client, db_async)
    home = await make_department(db_async)
    other = await make_department(db_async)
    await make_employee(db_async, user=owner, department_id=home.id)

    elsewhere = await _hr_over(db_async, other.id)
    refused = await async_client.delete(
        f"{URL}/org/{owner.id}", headers=headers_for(elsewhere)
    )
    assert refused.status_code == 403
    assert len(store.objects) == 3

    same = await _hr_over(db_async, home.id)
    removed = await async_client.delete(
        f"{URL}/org/{owner.id}", headers=headers_for(same)
    )
    assert removed.status_code == 204
    assert store.objects == {}


async def test_a_superuser_removes_any_photo(
    async_client: httpx.AsyncClient, db_async: AsyncSession, store: FakeStore
) -> None:
    owner = await _with_photo(async_client, db_async)
    admin = await make_user(db_async, superuser=True)
    response = await async_client.delete(
        f"{URL}/org/{owner.id}", headers=headers_for(admin)
    )
    assert response.status_code == 204
    assert store.objects == {}


async def test_a_failed_save_deletes_the_new_files(
    db_async: AsyncSession,
    store: FakeStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.profile_images import service

    user = await make_user(db_async)

    async def broken_commit() -> None:
        raise RuntimeError("database went away")

    monkeypatch.setattr(db_async, "commit", broken_commit)
    with pytest.raises(RuntimeError):
        await service.set_image(session=db_async, user=user, raw=_jpeg())
    await service.wait_for_reconciles()
    assert store.objects == {}
    assert len(store.deleted) == 3


async def _account_app_token(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[str, Any]:
    """Sign in to the account app through the single sign-on hand-off."""
    from src.auth.config import auth_settings
    from src.auth.permissions import seed_permissions_and_roles_async
    from tests.auth.test_app_handoff import _account_session, _redeem, _start, _state

    await seed_permissions_and_roles_async(db_async)
    secret = "account-test-client-secret"
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", secret)
    base = "/api/v1/auth/apps/account"
    session_secret = await _account_session(db_async, email="photo-owner@example.com")
    state = _state()
    started = await _start(async_client, session_secret, state, join=True, base=base)
    assert started.status_code == 200, started.text
    redeemed = await _redeem(
        async_client, started.json()["code"], state, base=base, secret=secret
    )
    assert redeemed.status_code == 200, redeemed.text
    body = redeemed.json()
    return body["access_token"], body


async def test_the_account_app_manages_only_your_own_photo(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token, _ = await _account_app_token(async_client, db_async, monkeypatch)
    headers = {"Authorization": f"Bearer {token}"}

    assert (await async_client.get(f"{URL}/me", headers=headers)).status_code == 404
    uploaded = await async_client.put(
        f"{URL}/me", content=_jpeg(), headers={**headers, "content-type": "image/jpeg"}
    )
    assert uploaded.status_code == 200, uploaded.text
    own = await async_client.get(f"{URL}/me/image", headers=headers)
    assert own.status_code == 307
    assert "/256.webp" in own.headers["location"]

    other = await _with_photo(async_client, db_async)
    refused = await async_client.get(f"{URL}/org/{other.id}", headers=headers)
    assert refused.status_code == 401
    staff = await async_client.get("/api/v1/hr/profile/me", headers=headers)
    assert staff.status_code == 401


async def test_other_app_sessions_cannot_use_the_photo_routes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    from datetime import timedelta

    from src.auth.utils import create_access_token

    user = await make_user(db_async)
    token = create_access_token(user.id, timedelta(minutes=5), app="events")
    response = await async_client.get(
        f"{URL}/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


async def test_a_cancelled_save_deletes_the_new_files(
    db_async: AsyncSession,
    store: FakeStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    from src.profile_images import service

    user = await make_user(db_async)

    async def cancelled_commit() -> None:
        raise asyncio.CancelledError

    monkeypatch.setattr(db_async, "commit", cancelled_commit)
    with pytest.raises(asyncio.CancelledError):
        await service.set_image(session=db_async, user=user, raw=_jpeg())
    await service.wait_for_reconciles()
    assert store.objects == {}
    assert len(store.deleted) == 3


async def test_the_eleventh_upload_in_a_minute_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.rate_limit import limiter

    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    user = await make_user(db_async)
    other = await make_user(db_async)
    headers = {**headers_for(user), "content-type": "image/jpeg"}
    photo = _jpeg((64, 64))
    statuses = [
        (
            await async_client.put(f"{URL}/me", content=photo, headers=headers)
        ).status_code
        for _ in range(11)
    ]
    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429
    # The limit counts per person, not per address.
    allowed = await async_client.put(
        f"{URL}/me",
        content=photo,
        headers={**headers_for(other), "content-type": "image/jpeg"},
    )
    assert allowed.status_code == 200
    limiter.reset()
