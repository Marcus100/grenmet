from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import Field

from src.models import BaseModel, UtcDateTime

ObservationKind = Literal["SYNOP", "METAR", "SPECI"]


class ObservationProvenance(BaseModel):
    source_system: str
    time_basis: Literal["source_observation", "source_issue", "unknown"]
    raw_tac: str | None = None
    bufr: dict[str, Any] | None = None
    iwxxm: dict[str, Any] | None = None
    quality_flags: list[str] = Field(default_factory=list)
    wis2_topic: str | None = None
    wis2_message_id: str | None = None
    publication_state: Literal["not_published", "published", "failed", "unknown"] = (
        "unknown"
    )


class ObservationRecord(BaseModel):
    id: str
    kind: ObservationKind
    station: str
    observed_at: UtcDateTime | None = None
    issued_at: UtcDateTime | None = None
    payload: dict[str, Any]
    provenance: ObservationProvenance


class ObservationList(BaseModel):
    observations: list[ObservationRecord]


def normalize_legacy_row(
    *, kind: ObservationKind, row: dict[str, Any]
) -> ObservationRecord:
    observed = row.get("observed_at")
    issued = row.get("issued_at")
    observed = observed.astimezone(UTC) if isinstance(observed, datetime) else observed
    issued = issued.astimezone(UTC) if isinstance(issued, datetime) else issued
    return ObservationRecord(
        id=f"wxproducts:{kind.lower()}:{row['id']}",
        kind=kind,
        station=row["station"],
        observed_at=observed,
        issued_at=issued,
        payload=row.get("body") or {},
        provenance=ObservationProvenance(
            source_system="wxproducts-legacy",
            time_basis="source_observation" if observed else "unknown",
            raw_tac=row.get("raw_tac"),
        ),
    )
