# ADR-0030: Rewards earn sources and gamification

## Status

Proposed. The owner approved the scope on 2026-10-20 (foundations slices PF8–PF11). This amends the rewards guardrails in the [foundations plan](../exec-plans/barrels-foundations-plan.md#barrels-id-and-rewards) and `src/rewards/AGENTS.md`.

## Context

Rewards U1–U4 are built:
- an append-only ledger with pending and confirmed entries;
- organisation-funded stamp cards;
- one-time redemption codes;
- derived trust badges;
- the account Rewards tab.

Stamps come from one source only: Events admissions, through the dedicated job `sync_event_rewards`. The owner wants rewards to work across every Barrels product. They also want more gamification, including some mechanics the original guardrails banned.

## Evidence

**Facts:**
- `program.qualifying_source_type` takes a single value, and earning is wired only for `events.admission` (`src/rewards/events_link.py`). (high)
- Passport and trails (U5) are planned but not built. (high)
- The original guardrails banned leaderboards, random prizes, rewards for opening the app, transfers, cash-out and buying points (`docs/strategy/loyalty-reference-study.md`). (high)

**Interpretation:**
- Leaderboards and streaks lift engagement in reference products. They also create privacy exposure and engagement-farming incentives. (heuristic, medium)
- Transferable stamps look like stored value, which may need a licence in Grenada. (speculation; needs legal advice; medium)

**Uncertainty:**
- The regulatory position of transferable, non-cash stamps. This must be settled before gifting is enabled in production. (low)

## Options considered

1. **Keep the original guardrails.** Lowest risk, but less engagement, and it overrides the owner's product call.
2. **Relax them with constraints (chosen).**
3. **Relax them fully,** including spend-ranked leaderboards and purchasable or cash-out points. Rejected: this adds stored-value and consumer-protection exposure.

## Decision

**PF8: generic earn sources**
- Any domain emits `rewards.qualifying_action` to the PF2 outbox, carrying a source type, a source reference, the organisation and the person.
- Rewards credits idempotently by source reference.
- `qualifying_source_type` becomes a catalogue. The first entries are Events admission, booking completed, invoice paid and payment succeeded.
- The Events admission path moves off `sync_event_rewards`.

**PF9: gamification core**
- Passport and trails (U5), including the sample "Parish Explorer".
- Achievements derived from records.
- Streaks driven by **real-world check-ins**: a signed, rotating venue QR, counted once per venue per day. Opening the app never counts.

**PF10: social layer** (each piece behind a feature flag, PF7)
- **Leaderboards:** opt-in and off by default. Ranked by actions, never by spend. Scoped to friends, an organisation or a community. A hidden-name option is available.
- **Community challenges:** time-boxed, with a shared non-monetary reward.
- **Stamp gifting:** limited to non-redeemable Passport stamps, or capped, and never cash-equivalent. **It stays off in production until an accountant and legal sign-off.**

**PF11: organisation rewards admin**
- Organisations manage stamp cards, trails and challenges and confirm redemptions, through organisation-zone routes and UI.

**Still banned:** cash withdrawal, buying points or stamps, random prizes and loot mechanics, rewards for opening the app, and spend-ranked public boards.

## Consequences

- Any Barrels product can reward real actions without writing its own sync job.
- Privacy notices need updating for leaderboards.
- Gifting carries a compliance dependency that blocks its production launch.
