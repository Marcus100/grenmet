# commerce domain — agent context

**Owner:** Barrels platform. The shared Commerce core for Shop Keeper and Salesbus (ADR-0063). Built so far: slice 0, products and price history. Read ADR-0063 before changing it.

## Built (slice 0)
- Schema `commerce`: `product` (name unique per organisation, base unit enum) and `price` (history: integer minor units, currency XCD, `effective_from`, one price per product and instant). Every row has `organisation_id`.
- Routes `/api/v1/commerce/org/...` (ADR-0025 org zone): list, get and create products; add and list prices. The current price is the latest `effective_from` at or before now, chosen in SQL.
- Keys `commerce.sell` (reads) and `commerce.catalogue.manage` (writes), organisation-bound (ADR-0044). Owners and admins hold them implicitly. No role bundle grants them yet.
- Access goes through `grants.has_org_permission` (`dependencies.py`), not `require_permission`. It also requires the organisation's `commerce` entitlement row. `commerce` is not in `entitlements.PRODUCTS`: adding it would create `commerce.read`/`commerce.write` API-key scopes (ADR-0029). Until an entitlement path exists, only a direct `org.organisation_app` row enables an organisation (the tests do this).
- Writes require an `Idempotency-Key` (`src/idempotency.py`, ADR-0026).

## Invariants
- Every query filters on `organisation_id` in SQL. Another organisation's product answers 404, never 403. Naming another organisation in the header answers 404 (not a member).
- Money: integer minor units, 0 to 10^10, currency XCD. The wire type is strict (no floats, numeric strings or booleans).
- Price rows are add-only: no update or delete route. A second price at the same `effective_from` is 409.
- No superuser bypass. Services flush and never commit; routers commit.

## Not built yet (ADR-0063, section 7)
Units and barcodes, stock movements, till sessions, sales, credit, devices and sync, trade links, support grants, and the `shopkeeper` app registration in `src/auth/apps.py`.

## Tests
`tests/commerce/test_catalogue_routes.py` (routes, price rules, idempotency, money, permissions) and `tests/commerce/test_tenancy.py` (tenancy inventory; a cross-organisation case for every `/commerce/org` operation). A new route needs a row in `OPERATIONS`, or the coverage test fails.
