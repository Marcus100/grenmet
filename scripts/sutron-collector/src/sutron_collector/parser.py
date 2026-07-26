import re
from decimal import Decimal, InvalidOperation

from sutron_collector.models import Observation

_TAG_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")


def parse_line(line: str) -> Observation | None:
    """Parse a tagged logger row, returning None for prompts and other noise."""

    raw_line = line.rstrip("\r\n")
    fields = raw_line.split()
    if len(fields) < 3:
        return None

    tag, raw_value, *status_tokens = fields
    if _TAG_PATTERN.fullmatch(tag) is None:
        return None

    try:
        value = Decimal(raw_value)
    except InvalidOperation:
        return None

    if not value.is_finite():
        return None

    return Observation(
        tag=tag,
        value=value,
        status_tokens=tuple(status_tokens),
        raw_line=raw_line,
    )


def parse_response(payload: bytes | str) -> tuple[Observation, ...]:
    """Parse all valid observation rows from one logger response."""

    text = (
        payload.decode("ascii", errors="replace")
        if isinstance(payload, bytes)
        else payload
    )
    return tuple(
        observation
        for line in text.splitlines()
        if (observation := parse_line(line)) is not None
    )
