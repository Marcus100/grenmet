"""External ticket link rules (ADR-0046, ADR-0048): https only, host visible, no tricks."""

import re
import unicodedata
from urllib.parse import urlsplit, urlunsplit

MAX_URL_LENGTH = 500
_HOST = re.compile(
    r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$"
)


def normalise_https_url(value: str) -> str:
    """Return the normalised https URL, or raise ``ValueError``.

    Refuses userinfo (``https://good.gd@evil.com``), an empty host, whitespace,
    control and format characters (NUL, C0, bidi marks), backslashes and
    non-ASCII hosts (punycode ``xn--`` is accepted). The scheme and host are
    lower-cased.
    """
    if not value or len(value) > MAX_URL_LENGTH:
        raise ValueError("The link must be 1 to 500 characters")
    for char in value:
        if (
            char.isspace()
            or char == "\\"
            or unicodedata.category(char) in {"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"}
        ):
            raise ValueError("The link contains characters that are not allowed")
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError as error:
        raise ValueError("The link is not a valid URL") from error
    if parts.scheme.lower() != "https":
        raise ValueError("The link must start with https://")
    if "@" in parts.netloc or parts.username is not None or parts.password is not None:
        raise ValueError("The link must not contain a username or password")
    host = (parts.hostname or "").lower()
    if not host or not host.isascii() or not _HOST.match(host):
        raise ValueError("The link needs a valid ASCII host name")
    netloc = f"{host}:{port}" if port is not None else host
    return urlunsplit(("https", netloc, parts.path or "/", parts.query, parts.fragment))


def vendor_host(url: str | None) -> str | None:
    """The lower-case host name of a stored link, for showing who sells the tickets."""
    if not url:
        return None
    host = urlsplit(url).hostname
    return host.lower() if host else None
