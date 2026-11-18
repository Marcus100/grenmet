"""Request parameter types that the database can always represent.

Free text and instants that reach SQL must be refused at the edge: PostgreSQL text
cannot hold a NUL character, and a datetime whose UTC value falls outside years 1
to 9999 cannot be sent as a query argument. Both used to surface as a 500. These
types answer 422 instead and leave the OpenAPI schema unchanged.
"""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator


def _without_nul(value: str) -> str:
    if "\x00" in value:
        raise ValueError("must not contain a null character")
    return value


def _representable(value: datetime) -> datetime:
    if value.tzinfo is not None:
        try:
            value.astimezone(UTC)
        except OverflowError:
            raise ValueError("is outside the supported range") from None
    return value


#: Text that is safe to pass to PostgreSQL (no NUL character).
SqlText = Annotated[str, AfterValidator(_without_nul)]
#: A datetime whose UTC instant is representable.
SqlDatetime = Annotated[datetime, AfterValidator(_representable)]
