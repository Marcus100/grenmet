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


# --------------------------------------------------------------------------- #
# SSRF guards — URL imports must reject non-public / redirecting / oversized
# sources. These use an injected MockTransport so no real network I/O occurs;
# validate_import_url runs on every URL regardless of the injected client.
# --------------------------------------------------------------------------- #

_SSRF_URLS = [
    "file:///etc/passwd",
    "ftp://example.test/cap.xml",
    "http://localhost/cap.xml",
    "http://127.0.0.1/cap.xml",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/cap.xml",
    "http://[::1]/cap.xml",
    "https://user:pass@example.test/cap.xml",
]


@pytest.mark.parametrize("bad_url", _SSRF_URLS)
async def test_import_rejects_ssrf_urls(db_async: AsyncSession, bad_url: str) -> None:
    user = await _user_with_perm(db_async)

    def handler(_request: httpx.Request) -> httpx.Response:  # pragma: no cover
        return httpx.Response(200, content=_XML.encode())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(CapImportError):
            await import_alert(
                session=db_async,
                current_user=user,
                source="url",
                value=bad_url,
                http_client=client,
            )


async def test_import_rejects_redirect(db_async: AsyncSession) -> None:
    user = await _user_with_perm(db_async)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://127.0.0.1/x"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(CapImportError):
            await import_alert(
                session=db_async,
                current_user=user,
                source="url",
                value="https://example.test/cap.xml",
                http_client=client,
            )


async def test_import_rejects_oversized_body(db_async: AsyncSession) -> None:
    from src.cap.validation import MAX_IMPORT_BYTES

    user = await _user_with_perm(db_async)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"x" * (MAX_IMPORT_BYTES + 1))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(CapImportError):
            await import_alert(
                session=db_async,
                current_user=user,
                source="url",
                value="https://example.test/cap.xml",
                http_client=client,
            )


async def test_ensure_public_host_rejects_private_resolution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import socket

    from src.cap import validation

    def _fake_getaddrinfo(*_args: object, **_kwargs: object) -> list[object]:
        return [(socket.AF_INET, None, None, "", ("127.0.0.1", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo)
    with pytest.raises(CapImportError):
        await validation.ensure_public_host("evil.test")
