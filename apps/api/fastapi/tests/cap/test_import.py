"""CAP import (src/cap/service.py:import_alert) — XML, URL, dedup, permission."""

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.exceptions import CapImportError
from src.cap.service import import_alert
from src.exceptions import AuthorizationError
from tests.factories import assign_role, make_role_with_permission, make_user

_XML = """<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>GRD-IMP-001</identifier>
  <sender>met@gov.gd</sender>
  <sent>2026-06-28T12:00:00+00:00</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <info>
    <category>Met</category>
    <event>Flash Flood</event>
    <urgency>Immediate</urgency>
    <severity>Severe</severity>
    <certainty>Likely</certainty>
    <headline>Flash Flood Warning</headline>
    <description>Heavy rainfall expected.</description>
    <area><areaDesc>St. George's</areaDesc></area>
  </info>
</alert>"""


async def _user_with_perm(db: AsyncSession):
    user = await make_user(db)
    role, _ = await make_role_with_permission(db, "cap.alert.create")
    await assign_role(db, user=user, role=role)
    return user


async def test_import_from_xml(db_async: AsyncSession) -> None:
    user = await _user_with_perm(db_async)
    alert = await import_alert(
        session=db_async, current_user=user, source="xml", value=_XML
    )
    assert alert.identifier == "GRD-IMP-001"
    assert alert.info[0].event == "Flash Flood"


async def test_import_from_url(db_async: AsyncSession) -> None:
    user = await _user_with_perm(db_async)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=_XML.encode())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        alert = await import_alert(
            session=db_async,
            current_user=user,
            source="url",
            value="https://example.test/cap.xml",
            http_client=client,
        )
    assert alert.identifier == "GRD-IMP-001"


async def test_duplicate_import_rejected(db_async: AsyncSession) -> None:
    user = await _user_with_perm(db_async)
    await import_alert(session=db_async, current_user=user, source="xml", value=_XML)
    with pytest.raises(CapImportError):
        await import_alert(
            session=db_async, current_user=user, source="xml", value=_XML
        )


async def test_import_requires_permission(db_async: AsyncSession) -> None:
    user = await make_user(db_async)  # no cap.alert.create
    with pytest.raises(AuthorizationError):
        await import_alert(
            session=db_async, current_user=user, source="xml", value=_XML
        )
