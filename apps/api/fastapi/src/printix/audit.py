"""Change history for Printix events, pairings and tickets (ADR-0060).

Flushed inserts and updates are recorded by the audit listener with the acting
administrator (``audit.service.set_actor``). Bulk writes (void, unvoid, the ticket
import) are recorded explicitly in ``service.py``. Excluded: the pairing's token
hash and every ticket's barcode value, so history never holds a credential.
"""

from src.audit import registry

from .models import PrintixEvent, PrintixPairing, PrintixTicket


def register() -> None:
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
