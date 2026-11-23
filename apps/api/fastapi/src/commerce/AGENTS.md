# commerce domain — agent context

**Owner:** Barrels platform. Shared Commerce core for Shop Keeper and Salesbus (ADR-0063). Built: slice 0, products and price history. Read ADR-0063 before changing it.

## Built (slice 0)
- Schema `commerce`: `product` (name unique per organisation) and `price` (history: integer minor units, XCD, `effective_from`). Every row has `organisation_id`.
- Routes `/api/v1/commerce/org/...`: list, get and create products; add and list prices. Current price = latest `effective_from` at or before now, chosen in SQL.
- Keys `commerce.sell` (reads) and `commerce.catalogue.manage` (writes), organisation-bound (ADR-0044). Owners and admins hold them implicitly.
- Access uses `grants.has_org_permission` (`dependencies.py`), which also requires the `commerce` entitlement row. `commerce` is not in `entitlements.PRODUCTS`: adding it would create `commerce.read`/`write` API-key scopes (ADR-0029). Only a direct `org.organisation_app` row enables an organisation today.
- Writes require `Idempotency-Key` (ADR-0026).

## Invariants
- Every query filters on `organisation_id` in SQL. Another organisation's product is 404, never 403.
- Money: integer minor units, 0 to 10^10, XCD. Strict wire types.
- `price` is append-only: trigger `price_append_only` refuses UPDATE, and refuses DELETE unless the organisation is gone (erasure cascade). `tests/conftest.py` disables it during cleanup, as for rewards.
- `effective_from` is within 1 year back or 5 years ahead (422). A second price at the same instant is 409.
- `price.created_by` has no foreign key, so user erasure never updates a price.
- No superuser bypass. Services flush; routers commit.

## Not built yet (ADR-0063 section 7)
Units and barcodes, stock, till sessions, sales, credit, devices, links, support grants, `shopkeeper` app registration.

## Tests
`tests/commerce/`: routes and price rules (`test_catalogue_routes.py`), tenancy inventory and a cross-organisation case per `/commerce/org` operation (`test_tenancy.py`; add a row to `OPERATIONS` for each new route), trigger and erasure cascade (`test_price_append_only.py`).
