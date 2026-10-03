# ADR-0013: Self-Publish CAP Alerts And Link Them To Their Source Bulletin

## Status

Accepted. Supersedes [ADR-0007](0007-cap-warning-lifecycle.md)'s mandatory
approval gate; the CAP-XML/audit/public-feed decisions in ADR-0007 stand.
Also reverses the "linking is deferred" stance in
`docs/operations/gms-products.md`.

## Context

GMS runs two parallel authored-content systems: `wxproducts` (Public Weather
Service forecasts and 8 event-triggered Hazard Bulletins) and CAP Alerts.
Every `wxproducts` item self-publishes — Draft → Published → Withdraw, one
author, no second approver. ADR-0007 gave CAP Alerts a different, heavier
shape instead: Draft → Submitted → Approved → Published → Expired/Cancelled.

In practice the same duty forecaster authors a Hazard Bulletin and the CAP
Alert escalated from it. A mandatory second approver before either can
publish doesn't match that reality, and — per
`docs/operations/gms-products.md` — the two are also currently unlinked:
"CAP is independent. These bulletins do not create CAP messages, synchronize
their statuses or contribute to CAP warning counts. Linking is deferred."
That leaves no way to trace which bulletin justified a given alert, and no
guarantee the two stay in sync (a withdrawn bulletin whose CAP Alert is still
live, or the reverse).

## Decision

1. **CAP Alerts adopt the same self-publish lifecycle as every other
   product**: Draft → Published → Withdraw/Cancel. The Submitted/Approved
   gate is dropped.
2. **Review remains available but is optional and non-blocking** — anyone can
   look at a Draft before it publishes; the author is never required to wait
   for it. This is the mitigation for removing the mandatory approval step,
   not a replacement for it.
3. **Publishing stays two independent actions per product.** Publishing a
   Hazard Bulletin does not auto-publish its linked CAP Alert, and vice
   versa — a forecaster clicks Publish on each separately.
4. **Source linkage is a manual convention, not a schema change.** When a
   bulletin escalates to a CAP Alert, the author records the bulletin's
   product ID and revision in the CAP Alert's existing free-text `note`
   field.
5. **Withdrawing the source bulletin always cascades to cancelling its linked
   CAP Alert.** The reverse depends on the source's category:
   - **PWS-sourced** (Marine Bulletin, a general forecast): cancelling or
     expiring the CAP Alert does **not** withdraw the source — it remains a
     valid scheduled record regardless of whether the hazard it flagged is
     still live.
   - **Hazard-Bulletin-sourced** (Cyclone, Flood, etc.): cancelling or
     expiring the CAP Alert **does** withdraw the source bulletin — an
     event-triggered bulletin has no standing reason to stay public once the
     hazard it existed for has been called off.
6. **The CAP escalation threshold stays a per-hazard advisory guideline, not
   a system-enforced gate.** Cyclone, marine, and heat thresholds differ; the
   framework is modular by hazard category rather than one universal rule.
   Where no table exists yet, escalation remains pure forecaster judgment.
7. **CAP → product fan-out extends beyond the 3 general forecasts.** The
   picker that copies a published CAP Alert's text into a product (today
   gated to Morning/Midday/Evening via `isForecastKind`) is extended to
   Marine Bulletin, Tropical Weather Outlook, and all 8 Hazard Bulletins.
8. **The 8 Hazard Bulletin kinds stay distinct — no collapse into one
   hazard-parameterized kind.** Heat's field shape (a heat-health assessment
   block) differs materially enough from the others that a generic merge
   would either bloat every other kind or lose it. `Hazard Bulletin` remains
   a domain grouping (`CONTEXT.md`), not a forced code merge — the same
   relationship PWS already has to its 5 distinct kinds. Future hazard kinds
   should take their event/category naming from the CAP hazard taxonomy
   already defined in `apps/web/gaa-admin/src/lib/cap-hazards.ts`
   (`CAP_HAZARD_GROUPS`) rather than inventing separate vocabulary — that
   taxonomy already covers hazards GMS has no bulletin kind for yet
   (Earthquake, Landslide, Volcanic Activity/Kick-'em-Jenny among them),
   pending a separate decision on whether GMS is the issuing authority for
   those.

## Consequences

- Removes the only independent second look before a public warning
  publishes. The trade-off is accepted deliberately: optional pre-publish
  Review plus post-publish Withdraw/Cancel replace a hard gate, favouring
  speed and single-author autonomy over a mandatory second signature.
- `docs/operations/gms-products.md` needs a follow-up edit once this ships —
  it currently documents the Submitted/Approved gate and the deferred-linking
  stance, both now stale.
- The `note` back-reference is free text: not queryable, not enforced. Any
  reporting that needs "which bulletin caused this CAP Alert" must parse
  text, not join a foreign key. A future ADR could formalize this into a
  real `source_product_id` field if that becomes a real cost.
- One item is deliberately left open, not settled by this ADR: whether GMS is
  the issuing authority for geophysical hazards (Earthquake, Landslide,
  Volcanic Activity) that CAP already has vocabulary for but GMS has no
  bulletin kind for. That decision gates whether any of those become new
  Hazard Bulletin kinds at all.
- Not yet implemented: FastAPI's CAP submit/approve/publish endpoints, the
  `/cap/admin/[id]` alert-workflow UI, and `CapForecastPicker`'s
  `isForecastKind` gate all require code changes before this ADR reflects
  the running system.
