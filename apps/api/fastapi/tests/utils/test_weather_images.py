import httpx
import pytest

from src.storage import service


@pytest.mark.asyncio
async def test_weather_images_require_identity(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get("/api/v1/wxwatch/images/goes19/test.png")
    assert response.status_code in {401, 403}


@pytest.mark.asyncio
async def test_weather_image_scopes_key_and_uses_short_expiry(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = []

    def sign(key: str, *, expires_in: int) -> str:
        calls.append((key, expires_in))
        return "https://objects.example.test/signed-image"

    monkeypatch.setattr(service.storage_service, "presigned_download_url", sign)
    response = await async_client.get(
        "/api/v1/wxwatch/images/goes19/test.png",
        headers=superuser_token_headers_async,
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert calls == [("wxwatch/goes19/test.png", 60)]
    assert response.headers["cache-control"] == "private, no-store"
    bad = await async_client.get(
        "/api/v1/wxwatch/images/avatars/file.svg", headers=superuser_token_headers_async
    )
    assert bad.status_code == 400
    assert len(calls) == 1
