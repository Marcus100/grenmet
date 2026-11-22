"""Global admin audit log: GET /audit/admin/entries (ADR-0065 step 4).

Covers the permission gate, filters, keyset pagination with equal timestamps,
the limit cap and sensitive-value masking.
"""

import uuid
from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import User
from tests.factories import make_role_with_permission, make_user
from tests.organisations.support import headers_for

URL = "/api/v1/audit/admin/entries"
KEY = "audit.entries.read"
SENSITIVE_KEY = "audit.view_sensitive"


def _etype() -> str:
    return f"audit_admin_{uuid.uuid4().hex[:10]}"


def _entry(
    *,
    entity_type: str,
    created_at: datetime,
    action: str = "update",
    organisation_id: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    changes: list[dict[str, object]] | None = None,
) -> AuditEntry:
    return AuditEntry(
        id=uuid.uuid4(),
        entity_type=entity_type,
        entity_id=str(uuid.uuid4()),
        record_type=entity_type,
        record_id=str(uuid.uuid4()),
        organisation_id=organisation_id,
        action=action,
        actor_user_id=actor_user_id,
        changes=changes or [],
        created_at=created_at,
    )


async def _reader(db: AsyncSession, *keys: str) -> User:
    """A signed-in user holding ``keys`` through one plain role (no superuser)."""
    user = await make_user(db)
    if keys:
        role, _ = await make_role_with_permission(db, *keys)
        user.roles.append(role)
        await db.commit()
    return user


async def _get(
    client: httpx.AsyncClient, user: User, **params: object
) -> httpx.Response:
    return await client.get(URL, headers=headers_for(user), params=params)


def _at(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp)


async def test_refused_without_the_key(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await _reader(db_async)
    resp = await _get(async_client, user, entity_type=_etype())
    assert resp.status_code == 403, resp.text


async def test_allowed_with_the_key_through_a_role(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    etype = _etype()
    db_async.add(_entry(entity_type=etype, created_at=_at("2026-11-10T09:00:00")))
    await db_async.commit()
    reader = await _reader(db_async, KEY)
    resp = await _get(async_client, reader, entity_type=etype)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["limit"] == 50
    assert len(body["data"]) == 1
    row = body["data"][0]
    assert row["entity_type"] == etype
    assert row["entity_id"]
    assert "organisation_id" in row


async def test_allowed_for_a_superuser(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    etype = _etype()
    db_async.add(_entry(entity_type=etype, created_at=_at("2026-11-10T09:00:00")))
    await db_async.commit()
    superuser = await make_user(db_async, superuser=True)
    resp = await _get(async_client, superuser, entity_type=etype)
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["data"]) == 1


async def test_filters_narrow_the_log(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    etype = _etype()
    actor_a = await make_user(db_async)
    actor_b = await make_user(db_async)
    rows = [
        _entry(
            entity_type=etype,
            created_at=_at("2026-11-10T08:00:00"),
            action="create",
            organisation_id="gaa",
            actor_user_id=actor_a.id,
        ),
        _entry(
            entity_type=etype,
            created_at=_at("2026-11-11T08:00:00"),
            action="update",
            organisation_id="gaa",
            actor_user_id=actor_b.id,
        ),
        _entry(
            entity_type=etype,
            created_at=_at("2026-11-12T08:00:00"),
            action="update",
            organisation_id=None,
            actor_user_id=actor_a.id,
        ),
    ]
    db_async.add_all(rows)
    await db_async.commit()
    reader = await _reader(db_async, KEY)

    def ids(resp: httpx.Response) -> set[str]:
        assert resp.status_code == 200, resp.text
        return {row["id"] for row in resp.json()["data"]}

    base = {"entity_type": etype}
    by_actor = await _get(async_client, reader, actor_id=str(actor_a.id), **base)
    assert ids(by_actor) == {str(rows[0].id), str(rows[2].id)}
    by_action = await _get(async_client, reader, action="create", **base)
    assert ids(by_action) == {str(rows[0].id)}
    by_org = await _get(async_client, reader, organisation_id="gaa", **base)
    assert ids(by_org) == {str(rows[0].id), str(rows[1].id)}
    window = await _get(
        async_client,
        reader,
        created_from="2026-11-10T12:00:00Z",
        created_to="2026-11-11T12:00:00Z",
        **base,
    )
    assert ids(window) == {str(rows[1].id)}
    by_type = await _get(async_client, reader, entity_type="no_such_type_x")
    assert ids(by_type) == set()


async def test_inverted_date_window_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    reader = await _reader(db_async, KEY)
    resp = await _get(
        async_client,
        reader,
        created_from="2026-11-12T00:00:00Z",
        created_to="2026-11-10T00:00:00Z",
    )
    assert resp.status_code == 422, resp.text


async def test_date_outside_the_calendar_is_refused_not_a_server_error(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    reader = await _reader(db_async, KEY)
    # Converting year 1 with a positive offset to UTC would step before year 1.
    resp = await _get(async_client, reader, created_from="0001-01-01T00:00:00+01:00")
    assert resp.status_code == 422, resp.text


async def test_newest_first_across_distinct_times(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    etype = _etype()
    early = _entry(entity_type=etype, created_at=_at("2026-11-10T08:00:00"))
    late = _entry(entity_type=etype, created_at=_at("2026-11-12T08:00:00"))
    middle = _entry(entity_type=etype, created_at=_at("2026-11-11T08:00:00"))
    db_async.add_all([early, late, middle])
    await db_async.commit()
    reader = await _reader(db_async, KEY)
    resp = await _get(async_client, reader, entity_type=etype)
    assert [row["id"] for row in resp.json()["data"]] == [
        str(late.id),
        str(middle.id),
        str(early.id),
    ]


async def test_pagination_is_stable_with_equal_timestamps(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    etype = _etype()
    same = _at("2026-11-10T08:00:00")
    rows = [_entry(entity_type=etype, created_at=same) for _ in range(7)]
    db_async.add_all(rows)
    await db_async.commit()
    reader = await _reader(db_async, KEY)

    # Same timestamp everywhere, so the id tie-break alone decides the order.
    expected = [str(row.id) for row in sorted(rows, key=lambda r: r.id, reverse=True)]
    seen: list[str] = []
    cursor: str | None = None
    pages = 0
    while True:
        params: dict[str, object] = {"entity_type": etype, "limit": 3}
        if cursor is not None:
            params["cursor"] = cursor
        resp = await _get(async_client, reader, **params)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        seen.extend(row["id"] for row in body["data"])
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert pages == 3
    assert seen == expected  # no duplicates, nothing skipped


async def test_default_limit_is_fifty_and_the_cursor_continues(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    etype = _etype()
    db_async.add_all(
        [
            _entry(entity_type=etype, created_at=_at("2026-11-10T08:00:00"))
            for _ in range(52)
        ]
    )
    await db_async.commit()
    reader = await _reader(db_async, KEY)
    first = (await _get(async_client, reader, entity_type=etype)).json()
    assert len(first["data"]) == 50
    assert first["next_cursor"] is not None
    second = (
        await _get(async_client, reader, entity_type=etype, cursor=first["next_cursor"])
    ).json()
    assert len(second["data"]) == 2
    assert second["next_cursor"] is None
    ids = [row["id"] for row in first["data"] + second["data"]]
    assert len(set(ids)) == 52


async def test_limit_is_capped_at_two_hundred(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    reader = await _reader(db_async, KEY)
    for bad in (0, 201, 10_000):
        resp = await _get(async_client, reader, limit=bad)
        assert resp.status_code == 422, (bad, resp.text)
    ok = await _get(async_client, reader, limit=200)
    assert ok.status_code == 200, ok.text
    assert ok.json()["limit"] == 200


async def test_tampered_cursor_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    reader = await _reader(db_async, KEY)
    for bad in ("not-a-cursor", "e30", "eyJ0IjogIm5vdC1hLWRhdGUiLCAiaSI6ICJ4In0="):
        resp = await _get(async_client, reader, cursor=bad)
        assert resp.status_code == 422, (bad, resp.text)


async def test_sensitive_values_are_masked_without_view_sensitive(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    etype = _etype()
    db_async.add(
        _entry(
            entity_type=etype,
            created_at=_at("2026-11-10T08:00:00"),
            changes=[
                {
                    "field": "notes",
                    "old": "medical a",
                    "new": "medical b",
                    "sensitive": True,
                },
                {
                    "field": "provider",
                    "old": "Red",
                    "new": "St John",
                    "sensitive": False,
                },
            ],
        )
    )
    await db_async.commit()
    reader = await _reader(db_async, KEY)
    resp = await _get(async_client, reader, entity_type=etype)
    changes = {c["field"]: c for c in resp.json()["data"][0]["changes"]}
    assert changes["notes"]["masked"] is True
    assert changes["notes"]["old"] is None and changes["notes"]["new"] is None
    assert changes["provider"]["masked"] is False
    assert changes["provider"]["old"] == "Red"


async def test_sensitive_values_show_with_view_sensitive(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    etype = _etype()
    db_async.add(
        _entry(
            entity_type=etype,
            created_at=_at("2026-11-10T08:00:00"),
            changes=[
                {
                    "field": "notes",
                    "old": "medical a",
                    "new": "medical b",
                    "sensitive": True,
                },
            ],
        )
    )
    await db_async.commit()
    reader = await _reader(db_async, KEY, SENSITIVE_KEY)
    resp = await _get(async_client, reader, entity_type=etype)
    change = resp.json()["data"][0]["changes"][0]
    assert change["masked"] is False
    assert change["old"] == "medical a"
    assert change["new"] == "medical b"
