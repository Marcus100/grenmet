# ADR-0029: Organisation API keys and outbound webhooks

## Status

Built (PF5 API keys, PF6 webhooks), awaiting owner acceptance. On 2026-10-20 the owner approved building both before the first client needs them (foundations slices PF5 and PF6). This reverses the earlier rule that N4 waits for a client (ADR-0025). PF5 (API keys) is implemented: scopes are product-level `<product>.<read|write>` in `src/organisations/api_key_scopes.py` rather than `permissions.py` keys, and are bounded by the creator being an organisation admin or owner and by the organisation's entitlement. PF6 (outbound webhooks) is implemented in `src/webhooks_out`: `webhooks.endpoint` and `webhooks.delivery`, an event catalogue, delivery on the PF2 outbox (`webhook.deliver`), `whsec_` secrets encrypted with `ORG_SECRET_ENCRYPTION_KEYS`, an SSRF guard at registration and delivery, and signing generalised into `src/utils/signing.py`. Producers call `emit_event_safely`: bookings (`booking.created`, `booking.cancelled`, `booking.rescheduled`), payments (`payment.succeeded`, `payment.refunded`) and contacts (`contact.erased`).

## Context

Future clients include mobile apps, kiosks, partner websites and organisations' own back-office systems. They need two things browser sessions don't give them:
- a credential that is not tied to a browser (ADR-0016 sessions are per app and per browser);
- a push signal when something happens.

Today:
- The only non-browser credential is a per-app SSO `client_secret` held in env.
- The only outbound webhook was CAP's (`CapWebhook`, HMAC-signed, `src/worker/publishers.py`, using `src/utils/signing.py`).

## Evidence

**Facts:**
- `OrgContext` resolves only from a user token plus the `X-Barrels-Organisation` header (`src/organisations/dependencies.py`). (high)
- Permission keys live in one catalogue (`src/auth/permissions.py`), and a test rejects unknown keys. (high)
- CAP webhook signing and retries already exist and work. (high)

**Interpretation:**
- Scoped, hashed, rotatable keys plus signed webhooks are the standard way a platform serves server-to-server clients. (best practice, high)

**Uncertainty:**
- The scope vocabulary for products such as bookings and rewards, which have no permission keys today. Keys may need product scopes (e.g. `bookings.read`) added to the catalogue. (medium)

## Options considered

1. **Wait for a client.** Avoids speculative work, but the first integration then lands under time pressure.
2. **Organisation-scoped keys with explicit scopes and signed webhooks (chosen).**
3. **OAuth client credentials.** More standard for third parties, but needs a full authorisation server. Revisit when partners outside Barrels' clients appear.

## Decision

**API keys (PF5):**
- Table `org.api_key`: organisation, name, a prefix shown in lists, an SHA-256 hash, scopes, `expires_at`, `last_used_at`, `revoked_at`, creator.
- The secret `bk_<prefix>_<random>` is shown once.
- `Authorization: Bearer bk_…` resolves to an `OrgContext`-equivalent caller restricted to the key's scopes.
- A key's scopes are taken from `permissions.py` and are never wider than its creator's role. Owner decision 2026-10-20 (decided, to be implemented): API-key scopes reference the same permission keys as `src/auth/permissions.py`, one list, not the separate product-level list in `src/organisations/api_key_scopes.py`; a test fails on an unknown scope.
- Creation, rotation and revocation are audited.
- Entitlements (`require_org_app`) still apply.

**Outbound webhooks (PF6):**
- Organisations register endpoints with an event-type filter.
- Payloads are signed with HMAC-SHA256 over a timestamp and the body, generalising CAP's signer.
- Delivery uses the PF2 outbox with retries and a replay window.
- Endpoints that keep failing are disabled automatically and the organisation is notified (built in `src/webhooks_out/delivery.py`).

## Consequences

- Barrels can serve native apps, kiosks and partner systems without browser sessions.
- Key leakage becomes a real risk, mitigated by expiry, revocation, scope limits and `last_used_at` monitoring.
- Webhook payloads become a contract and need to be versioned.
