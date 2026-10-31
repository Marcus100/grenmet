"""Fetch a CAP document or feed from an address we have already checked.

The caller runs the public-host check (``ensure_public_host``) and passes the address
it returned. The connection goes to that address, so the name is not resolved again
between the check and the connection. The Host header and the TLS server name keep the
original host, so certificates still match.

The request URL is rebuilt from parsed components that are re-encoded here. No
user-supplied string is sent as a whole URL. Only https is fetched, except plain http
for a registered feed that uses it. Redirects are not followed, the timeout is fixed,
and the body is read with a size cap.
"""

from dataclasses import dataclass
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

import httpx

from src.cap.exceptions import CapImportError

TIMEOUT_SECONDS = 15.0
_PATH_SAFE = "/:@!$&'()*+,;=-._~%"


@dataclass(frozen=True)
class Fetched:
    status: int
    headers: httpx.Headers
    body: bytes


async def fetch_pinned(
    client: httpx.AsyncClient,
    url: str,
    *,
    address: str | None,
    max_bytes: int,
    headers: dict[str, str] | None = None,
    allow_http: bool = False,
) -> Fetched:
    """GET ``url`` by connecting to ``address``. Raises ``CapImportError`` on refusal.

    ``address`` is the address ``ensure_public_host`` returned. ``None`` (a test
    client with the host check bypassed) connects to the host name itself.
    """
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    if scheme == "http":
        if not allow_http:
            raise CapImportError("only https is fetched for CAP imports")
    elif scheme != "https":
        raise CapImportError("only https is fetched for CAP imports")
    host = parts.hostname
    if not host:
        raise CapImportError("import URL has no host")
    try:
        port = parts.port
    except ValueError as exc:
        raise CapImportError("import URL has an invalid port") from exc

    target = address or host
    connect_host = f"[{target}]" if ":" in target else target
    connect_netloc = f"{connect_host}:{port}" if port else connect_host
    path = quote(parts.path or "/", safe=_PATH_SAFE)
    query = urlencode(parse_qsl(parts.query, keep_blank_values=True))
    request_url = urlunsplit((scheme, connect_netloc, path, query, ""))

    host_header_name = f"[{host}]" if ":" in host else host
    host_header = f"{host_header_name}:{port}" if port else host_header_name
    extensions = {"sni_hostname": host} if scheme == "https" else {}
    request_headers = {**(headers or {}), "Host": host_header}
    try:
        async with client.stream(
            "GET",
            request_url,
            headers=request_headers,
            timeout=TIMEOUT_SECONDS,
            follow_redirects=False,
            extensions=extensions or None,
        ) as response:
            if response.status_code == 304:  # not modified: checked before redirects
                return Fetched(304, response.headers, b"")
            if response.is_redirect:
                raise CapImportError("redirects are not followed for CAP imports")
            response.raise_for_status()
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise CapImportError(f"import exceeds {max_bytes} byte limit")
                chunks.append(chunk)
            return Fetched(response.status_code, response.headers, b"".join(chunks))
    except httpx.HTTPError as exc:
        raise CapImportError(f"could not fetch source: {type(exc).__name__}") from exc
