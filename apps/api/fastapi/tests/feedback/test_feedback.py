"""Anonymous page feedback: stored, validated, rate-limited at the edge."""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.feedback.models import PageFeedback

_URL = "/api/v1/feedback"


def _payload(path: str, **overrides: object) -> dict[str, object]:
    return {"site": "docs", "page_path": path, "helpful": True, **overrides}


async def _rows(db: AsyncSession, path: str) -> list[PageFeedback]:
    db.expire_all()
    return list(
        (
            await db.scalars(select(PageFeedback).where(PageFeedback.page_path == path))
        ).all()
    )


async def test_feedback_is_stored(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    path = "/fb-stored/page"
    resp = await async_client.post(
        _URL, json=_payload(path, helpful=False, comment="  Needs a diagram.  ")
    )
    assert resp.status_code == 202
    assert resp.json() == {"ok": True}
    [row] = await _rows(db_async, path)
    assert row.site == "docs"
    assert row.helpful is False
    assert row.comment == "Needs a diagram."


async def test_comment_is_optional_and_blank_becomes_none(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    path = "/fb-blank/page"
    resp = await async_client.post(_URL, json=_payload(path, comment="   "))
    assert resp.status_code == 202
    [row] = await _rows(db_async, path)
    assert row.comment is None
    assert row.helpful is True


@pytest.mark.parametrize(
    "overrides",
    [
        {"comment": "x" * 1001},
        {"site": "Docs Site!"},
        {"page_path": "no-leading-slash"},
        {"page_path": "/a?utm=1"},
        {"helpful": "maybe"},
    ],
)
async def test_invalid_input_is_rejected(
    async_client: httpx.AsyncClient, overrides: dict[str, object]
) -> None:
    resp = await async_client.post(_URL, json=_payload("/fb-bad", **overrides))
    assert resp.status_code in {400, 422}


async def test_comment_at_limit_is_accepted(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    path = "/fb-limit"
    resp = await async_client.post(_URL, json=_payload(path, comment="x" * 1000))
    assert resp.status_code == 202
    assert len(await _rows(db_async, path)) == 1
