"""Change history for Printix events, pairings and tickets (ADR-0060).

Flushed inserts and updates are recorded by the audit listener with the acting
administrator (``audit.service.set_actor``). Bulk writes (void, unvoid, the ticket
import) are recorded explicitly in ``service.py``. Excluded: the pairing's token
hash and every ticket's barcode value, so history never holds a credential.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.auth.models import User

from .models import PrintixEvent, PrintixPairing, PrintixTicket


async def _superuser_only(session: AsyncSession, actor: User, entity_id: str) -> bool:
    """Printix history is for superusers: a gate pairing's history names its gate."""
    del session, entity_id  # the check needs only who is asking
    return actor.is_superuser


def register() -> None:
    registry.register_entity("printix_event", _superuser_only)
    registry.track(
        PrintixEvent,
        record_type="printix_event",
        entity_type="printix_event",
        label="Printix event",
    )
    registry.track(
        PrintixPairing,
        record_type="printix_pairing",
        entity_type="printix_event",
        entity_id_attr="event_id",
        exclude=("token_hash",),
        label="Printix gate pairing",
    )
    registry.track(
        PrintixTicket,
        record_type="printix_ticket",
        entity_type="printix_event",
        entity_id_attr="event_id",
        exclude=("barcode_value",),
        label="Printix ticket",
    )
