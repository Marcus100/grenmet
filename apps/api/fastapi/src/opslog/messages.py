"""The outbox message other modules send to write an automatic log entry (ADR-0067).

A module never imports opslog models or services. It enqueues one message in the
transaction that causes the entry::

    await outbox.enqueue(
        session,
        topic="opslog.entry_post",
        organisation_id=org_id,
        dedupe_key=f"incidents.opened:{incident.id}",
        payload={
            "text": "Incident opened: fuel spill at stand 3",
            "occurred_at": "2026-11-25T14:02:00Z",
            "record": {"kind": "incidents.incident", "id": incident.id},
        },
    )

``log_id`` is optional: without it the entry goes to the organisation's oldest
active log that accepts automatic entries, and is dropped (logged, not retried)
when there is none or the organisation has no operations log entitlement.
"""

from pydantic import Field

from src.models import BaseModel, UtcDateTime

ENTRY_POST_TOPIC = "opslog.entry_post"


class EntryPostRecord(BaseModel):
    kind: str = Field(min_length=1, max_length=60, pattern=r"^[a-z_]+\.[a-z_]+$")
    id: str = Field(min_length=1, max_length=100)


class EntryPostPayload(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    occurred_at: UtcDateTime | None = None
    log_id: str | None = Field(default=None, max_length=100)
    category_id: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)
    private: bool = False
    record: EntryPostRecord | None = None
