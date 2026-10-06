from urllib.parse import quote

import pytest

from src.cap import attachments
from src.cap.models import CapLifecycleState, CapScope, CapStatus
from src.config import settings
from src.storage.service import storage_service
from tests.worker.test_dispatch import _add_published_alert


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind,suffix", [("pdf", ".pdf"), ("social", "-social.png"), ("map", "-map.png")]
)
async def test_public_attachment_signed_after_scope_check(
    async_client, db_async, monkeypatch, kind, suffix
):
    alert = await _add_published_alert(db_async)
    signed = []

    def sign(key, *, expires_in):
        signed.append((key, expires_in))
        return "https://storage.example.test/signed"

    monkeypatch.setattr(storage_service, "presigned_download_url", sign)
    url = f"/api/cap/alerts/{quote(alert.identifier, safe='')}/attachments/{kind}"
    response = await async_client.get(url, follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "https://storage.example.test/signed"
    assert response.headers["cache-control"] == "no-store"
    assert signed == [(f"cap/{alert.identifier}{suffix}", 60)]

    alert.scope = CapScope.PRIVATE
    await db_async.commit()
    response = await async_client.get(url, follow_redirects=False)
    assert response.status_code == 404
    assert len(signed) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field,value",
    [
        ("scope", CapScope.RESTRICTED),
        ("lifecycle_state", CapLifecycleState.DRAFT),
        ("lifecycle_state", CapLifecycleState.SUBMITTED),
        ("lifecycle_state", CapLifecycleState.APPROVED),
        ("status", CapStatus.EXERCISE),
        ("status", CapStatus.TEST),
    ],
)
async def test_nonpublic_attachment_never_signed(
    async_client, db_async, monkeypatch, field, value
):
    alert = await _add_published_alert(db_async)
    setattr(alert, field, value)
    await db_async.commit()

    def forbidden(*_args, **_kwargs):
        pytest.fail("Storage signing must not occur")

    monkeypatch.setattr(storage_service, "presigned_download_url", forbidden)
    response = await async_client.get(
        f"/api/cap/alerts/{quote(alert.identifier, safe='')}/attachments/pdf",
        follow_redirects=False,
    )
    assert response.status_code == 404


def test_worker_url_uses_api_origin(monkeypatch):
    monkeypatch.setattr(settings, "API_BASE_URL", "https://api.staging.example.test")
    assert (
        attachments.public_url("urn:test:123", "pdf")
        == "https://api.staging.example.test/api/cap/alerts/urn%3Atest%3A123/attachments/pdf"
    )
