# audit domain — agent context

**Owner:** Barrels platform (ADR-0009 core). Field-level change history for any domain.

## How it works
- Domains opt models in with `src.audit.registry.track(...)` (see `src/hr/audit.py`). The flush listener (`listener.py`) writes one `AuditEntry` per changed row **in the same transaction** as the change.
- For changes outside the ORM flush, call `src.audit.service.record_change`.
- `GET /api/v1/audit/{entity_type}/{entity_id}`: paginated, newest first; readable by anyone who may read the record. Sensitive fields return `masked: true` unless the reader holds `audit.view_sensitive`.

## Invariants
- Never re-derive access or masking client-side; the API is authoritative.
- Don't write audit rows in a separate transaction — history must commit or roll back with the change.
- Register sensitive fields explicitly when tracking a model.

## Tests
`tests/audit/test_audit.py`.

## Related
`docs/api/contracts.md` → Change history and notifications; gaa-admin `components/audit/record-history.tsx`; ADR-0014 (AI execution records extend this).
