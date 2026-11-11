"""Public PDF and recent-issues list: every issued product has a permanent page,
a PDF and a feed entry (#1197, F4)."""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.main import app
from src.wxproducts import database, pdf, service
from src.wxproducts.dependencies import get_session
from src.wxproducts.schemas import ProductPdfSourceAdapter
from tests.wxproducts.test_public_products import (
    insert_product,
    snapshot,
    weather_db,  # noqa: F401  (fixture)
)

ISSUED = "/api/v1/wxproducts/public/issued-products"


def published_at(when: str, **values: str):
    product = snapshot("morning", **values)
    product.publishedAt = when
    return product


async def use(session: AsyncSession) -> None:
    async def override() -> AsyncGenerator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override


async def test_recent_issues_are_newest_first_with_expired_ones_and_no_drafts(
    weather_db: AsyncSession,  # noqa: F811
) -> None:
    older = published_at(
        "2026-09-07T11:00:00Z",
        issuedAt="2026-09-07T05:00",
        validFrom="2026-09-07T05:00",
        validTo="2026-09-08T05:00",
    )
    newer = published_at("2026-09-08T11:00:00Z")
    future = published_at("2026-09-09T11:00:00Z")
    for product in (older, newer, future):
        await insert_product(weather_db, product)
    await insert_product(weather_db, snapshot(), published=False)
    now = datetime(2026, 9, 8, 12, tzinfo=UTC)
    issued = await service.list_issued_products(weather_db, limit=10, now=now)
    assert [product.id for product, _ in issued] == [newer.id, older.id]
    assert [current for _, current in issued] == [True, False]
    assert len(await service.list_issued_products(weather_db, limit=1, now=now)) == 1


async def test_issued_route_shape_limit_and_privacy(
    async_client: httpx.AsyncClient,
    weather_db: AsyncSession,  # noqa: F811
) -> None:
    product = published_at("2000-01-01T11:00:00Z", issuedAt="2000-01-01T07:00")
    await insert_product(weather_db, product)
    await use(weather_db)
    try:
        result = await async_client.get(ISSUED)
        assert result.status_code == 200, result.text
        assert result.headers["cache-control"] == "no-store"
        assert result.json() == {
            "products": [{**product.model_dump(mode="json"), "current": False}]
        }
        assert "PRIVATE" not in result.text
        assert (await async_client.get(ISSUED + "?limit=51")).status_code == 422
        assert (await async_client.get(ISSUED + "?limit=0")).status_code == 422
    finally:
        app.dependency_overrides.pop(get_session, None)


async def test_issued_route_unconfigured_is_unavailable(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(database.wxproducts_settings, "DATABASE_URL", None)
    monkeypatch.setattr(database, "_engine", None)
    response = await async_client.get(ISSUED)
    assert response.status_code == 503
    assert set(response.json()) == {"error"}


async def test_pdf_renders_the_published_revision_inline(
    async_client: httpx.AsyncClient,
    weather_db: AsyncSession,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    product = published_at("2000-01-01T11:00:00Z", issuedAt="2000-01-01T07:00")
    product.revision = 3
    await insert_product(weather_db, product)
    asked: list[tuple[UUID, int, Any]] = []

    async def source(
        _session: AsyncSession, product_id: UUID, revision: int, kinds: Any
    ):
        asked.append((product_id, revision, kinds))
        return ProductPdfSourceAdapter.validate_python(
            {
                "product_id": product_id,
                "revision": revision,
                "kind": "morning",
                "values": product.values.model_dump(mode="json")
                if hasattr(product.values, "model_dump")
                else product.values,
                "action": "publish",
                "recorded_at": "2000-01-01T11:00:00Z",
                "current_publication": True,
            }
        )

    monkeypatch.setattr(service, "pdf_source", source)
    monkeypatch.setattr(pdf, "render_product_pdf", lambda *_a, **_k: b"%PDF-1.7 ok")
    await use(weather_db)
    try:
        result = await async_client.get(
            f"/api/v1/wxproducts/public/products/{product.id}/pdf"
        )
        assert result.status_code == 200, result.text
        assert result.content == b"%PDF-1.7 ok"
        assert result.headers["content-type"] == "application/pdf"
        assert result.headers["content-disposition"].startswith("inline;")
        assert "GMS Morning Forecast" in result.headers["content-disposition"]
        # The published revision, with no staff kind filter.
        assert asked == [(product.id, 3, None)]
    finally:
        app.dependency_overrides.pop(get_session, None)


async def test_pdf_of_a_draft_withdrawn_or_unknown_product_is_404(
    async_client: httpx.AsyncClient,
    weather_db: AsyncSession,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    draft = snapshot()
    await insert_product(weather_db, draft, published=False)
    withdrawn = published_at("2000-01-01T11:00:00Z")
    await insert_product(weather_db, withdrawn)
    await weather_db.execute(
        text("UPDATE authored_products SET published = NULL WHERE id = :id"),
        {"id": withdrawn.id},
    )

    def never(*_a: Any, **_k: Any) -> bytes:
        raise AssertionError("must not render")

    monkeypatch.setattr(pdf, "render_product_pdf", never)
    await use(weather_db)
    try:
        for product_id in (draft.id, withdrawn.id, uuid4()):
            result = await async_client.get(
                f"/api/v1/wxproducts/public/products/{product_id}/pdf"
            )
            assert result.status_code == 404
            assert result.json() == {"error": "Product not found"}
    finally:
        app.dependency_overrides.pop(get_session, None)


async def test_pdf_unconfigured_is_unavailable(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(database.wxproducts_settings, "DATABASE_URL", None)
    monkeypatch.setattr(database, "_engine", None)
    response = await async_client.get(
        f"/api/v1/wxproducts/public/products/{uuid4()}/pdf"
    )
    assert response.status_code == 503
