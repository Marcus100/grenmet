from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from src.main import app
from src.wxproducts import database, service
from src.wxproducts.dependencies import get_session
from src.wxproducts.schemas import ProductKind, PublishedProduct


def snapshot(kind: ProductKind = "marine", **values: str) -> PublishedProduct:
    return PublishedProduct(
        id=uuid4(),
        revision=1,
        publishedAt="2026-09-08T09:00:00Z",
        kind=kind,
        values={
            "issuedAt": "2026-09-08T05:00",
            "validFrom": "2026-09-08T05:00",
            "validTo": "2026-09-09T05:00",
            **values,
        },
    )


@pytest.mark.parametrize(
    ("kind", "instant", "expected"),
    [
        ("morning", "2026-09-08T10:59:59Z", False),
        ("morning", "2026-09-08T11:00:00Z", True),
        ("morning", "2026-09-09T10:59:59Z", True),
        ("morning", "2026-09-09T11:00:00Z", False),
        ("midday", "2026-09-08T15:59:59Z", False),
        ("midday", "2026-09-08T16:00:00Z", True),
        ("midday", "2026-09-09T11:00:00Z", False),
        ("evening", "2026-09-08T21:59:59Z", False),
        ("evening", "2026-09-08T22:00:00Z", True),
        ("evening", "2026-09-13T10:59:59Z", True),
        ("evening", "2026-09-13T11:00:00Z", False),
        ("marine", "2026-09-08T09:00:00Z", True),
        ("marine", "2026-09-09T09:00:00Z", False),
    ],
)
def test_validity_boundaries(kind: ProductKind, instant: str, expected: bool) -> None:
    assert (
        service.is_current(snapshot(kind), datetime.fromisoformat(instant)) is expected
    )


@pytest.mark.parametrize(
    "values",
    [
        {"issuedAt": "2026-02-30T05:00"},
        {"validFrom": "not-a-date"},
        {"validTo": "2026-09-09T25:00"},
        {"validFrom": "2026-09-09T05:00"},
        {"issuedAt": "2026-09-09T05:00"},
    ],
)
def test_invalid_or_future_times_are_not_public(values: dict[str, str]) -> None:
    assert not service.is_current(
        snapshot(**values), datetime(2026, 9, 8, 12, tzinfo=UTC)
    )


def test_future_publication_is_not_public() -> None:
    product = snapshot()
    product.publishedAt = "2026-09-08T13:00:00Z"
    assert not service.is_current(product, datetime(2026, 9, 8, 12, tzinfo=UTC))


@pytest.fixture
async def weather_db(db_async: AsyncSession) -> AsyncGenerator[AsyncSession]:
    # Session-local table on the run-owned test DB; never touches wxproducts.
    await db_async.execute(
        text("""
        CREATE TEMP TABLE authored_products (
            id uuid PRIMARY KEY, kind text NOT NULL,
            draft jsonb NOT NULL, published jsonb
        ) ON COMMIT DROP
    """)
    )
    yield db_async
    await db_async.rollback()


async def insert_product(
    session: AsyncSession, product: PublishedProduct, *, published: bool = True
) -> None:
    statement = text("""
        INSERT INTO authored_products (id, kind, draft, published)
        VALUES (:id, :kind, :draft, :published)
    """).bindparams(
        bindparam("draft", type_=JSONB),
        bindparam("published", type_=JSONB(none_as_null=True)),
    )
    await session.execute(
        statement,
        {
            "id": product.id,
            "kind": product.kind,
            "draft": {"private": "UNPUBLISHED DRAFT", "actorId": "PRIVATE ACTOR"},
            "published": product.model_dump(mode="json") if published else None,
        },
    )


async def test_database_selection_sorting_and_snapshot_privacy(
    weather_db: AsyncSession,
) -> None:
    marine = snapshot()
    morning = snapshot("morning", issuedAt="2026-09-08T07:00")
    for product in (marine, morning, snapshot(validTo="2026-09-08T06:00")):
        await insert_product(weather_db, product)
    await insert_product(weather_db, snapshot(), published=False)
    # JSON null is distinct from SQL NULL but the old reader ignores both.
    await weather_db.execute(
        text(
            "INSERT INTO authored_products (id, kind, draft, published) "
            "VALUES (:id, 'marine', '{}'::jsonb, 'null'::jsonb)"
        ),
        {"id": uuid4()},
    )
    now = datetime(2026, 9, 8, 12, tzinfo=UTC)
    products = await service.list_published_products(weather_db, None, now=now)
    assert products == [morning, marine]
    assert await service.list_published_products(weather_db, "marine", now=now) == [
        marine
    ]
    assert await service.list_published_products(weather_db, "cyclone", now=now) == []
    assert "PRIVATE" not in str([product.model_dump() for product in products])


async def test_public_route_and_withdrawal(
    async_client: httpx.AsyncClient, weather_db: AsyncSession
) -> None:
    product = snapshot(
        issuedAt="2000-01-01T00:00",
        validFrom="2000-01-01T00:00",
        validTo="2099-01-01T00:00",
    )
    await insert_product(weather_db, product)

    async def override() -> AsyncGenerator[AsyncSession]:
        yield weather_db

    app.dependency_overrides[get_session] = override
    try:
        result = await async_client.get(
            "/api/v1/wxproducts/public/products?kind=marine"
        )
        assert result.status_code == 200, result.text
        assert result.headers["cache-control"] == "no-store"
        assert result.json() == {"products": [product.model_dump(mode="json")]}
        await weather_db.execute(text("UPDATE authored_products SET published = NULL"))
        result = await async_client.get("/api/v1/wxproducts/public/products")
        assert result.json() == {"products": []}
    finally:
        app.dependency_overrides.pop(get_session, None)


async def test_unconfigured_and_invalid_kind(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(database.wxproducts_settings, "DATABASE_URL", None)
    monkeypatch.setattr(database, "_engine", None)
    for suffix, code in [("", 503), ("?kind=unknown", 400), ("?kind=", 503)]:
        response = await async_client.get("/api/v1/wxproducts/public/products" + suffix)
        assert response.status_code == code
        assert response.headers["cache-control"] == "no-store"
        assert set(response.json()) == {"error"}


async def test_database_error_is_unavailable(
    async_client: httpx.AsyncClient, weather_db: AsyncSession
) -> None:
    await weather_db.execute(
        text("ALTER TABLE authored_products DROP COLUMN published")
    )

    async def override() -> AsyncGenerator[AsyncSession]:
        yield weather_db

    app.dependency_overrides[get_session] = override
    try:
        response = await async_client.get("/api/v1/wxproducts/public/products")
        assert response.status_code == 503
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {"error": "Product information is unavailable"}
    finally:
        app.dependency_overrides.pop(get_session, None)
