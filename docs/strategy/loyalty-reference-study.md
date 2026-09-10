# Loyalty and Gamification — Reference Study

**Status:** Research/reference asset — not an adoption decision
**Recorded:** 2026-09-10
**Owner:** Barrels Grenada
**Horizon:** Loyalty remains *Explore* in the
[portfolio implementation plan](../portfolio/barrels-portfolio-implementation-plan.md)

This document records reference products worth studying before Barrels designs
any loyalty or reward mechanic, and the small-market constraints that decide
which of them can transfer. It is a research asset under the
[planning index](../portfolio/README.md) classification rules: it has not passed
an adoption gate, it commits no capacity, and it does not authorize
implementation, payment processing, or a stored-value product.

It sits underneath
[Loyalty and responsible gamification](barrels-product-strategy.md#loyalty-and-responsible-gamification)
in the product strategy. Where the two disagree, the strategy governs today —
but several disagreements are recorded here as open questions rather than
settled law, because the strategy's gamification stance was written before this
survey and deserves to be re-tested against evidence.

## The decision that constrains every mechanic

Before choosing mechanics, decide who funds the reward.

| | Platform-funded | Merchant-funded |
| --- | --- | --- |
| Barrels pays | Yes — reward pool is a cost line | No — Barrels provides infrastructure |
| Accounting | Outstanding rewards are a liability with breakage assumptions | Merchant's own discount; no Barrels liability |
| Defensibility | High — the currency is proprietary and portable across merchants | Low — commoditized, a merchant can leave with its own offer |
| Failure mode | Reward pool outruns revenue before scale arrives | Fragmented, illegible to a resident using several merchants |
| Regulatory load | Heavy once a balance is transferable or cash-adjacent | Light |

Every mechanic below inherits its viability from this choice. The current
strategy has already chosen merchant-funded first, and this survey supports that
ordering for a market of Grenada's size: a platform-funded points economy is an
accounting liability carried against an unproven transaction volume. That is a
sequencing argument, not a permanent prohibition — platform-funded becomes
arguable once Events/Tickets produces real settlement volume and the funding can
be sized against observed revenue rather than a forecast.

## Tier 1 — references worth studying properly

### Starbucks Rewards — loyalty as a feature of the payment rail

Stars are earned on a purchase the customer would make anyway, redemption
thresholds are reachable in roughly two weeks, and the app owns the payment
step through a preloaded balance. The preloaded balance is the actual business:
it converts a loyalty programme into a large customer float.

**The transferable lesson is the placement, not the float.** Loyalty bolted onto
a payment rail beats loyalty as a standalone application. Nobody downloads a
loyalty app; they use something they already needed and accumulate something
along the way. For Barrels this argues for loyalty as a capability inside
Events/Tickets checkout, never as a product with its own front door.

**The float itself is a separate question with a regulatory gate** — see
[Open questions](#open-questions-carried-forward).

### Duolingo — the gamification reference implementation

Streaks with a paid streak-freeze escape hatch (loss aversion, monetized), XP
leagues that compete against roughly thirty strangers rather than a global
leaderboard, daily quests, and a mascot with licence to be aggressive in push
notifications.

The detail most summaries miss: **leagues relegate.** A user can drop a tier.
Downside risk is what makes the upside matter — a leaderboard you can only climb
stops motivating quickly.

The second detail matters more for Grenada: **a streak is self-referential.** It
works with a single user, because the comparison is against that user's own
history. A league does not. This is the cleanest small-N insight in the survey.

### Nike Run Club / Strava — social proof as the reward

Strava's segments turned every road into a leaderboard without funding a reward
pool at all. The product's own data was naturally comparable, so competition
came free. This is the cheapest loyalty mechanic that exists — but only when the
product already generates comparable data. Ticket purchases and event attendance
generate far less naturally comparable data than a running route does, so this
transfers weakly unless a Barrels Passport-style trail supplies the comparison.

### Amex Membership Rewards / Chase Ultimate Rewards — ambiguous currency

Points transferable to airline partners at variable value. The lesson is
uncomfortable but well-evidenced: **a point whose value is ambiguous and
occasionally spectacular retains better than a fixed 1% back.** Fixed cashback
is legible, and legibility makes it easy to compute that the reward is small.

This mechanic is in direct tension with the strategy's requirement that points
have clear value. Recorded as an open question, not a recommendation.

## Tier 2 — mechanic-specific references

| Reference | Mechanic worth studying | Relevance here |
| --- | --- | --- |
| Sephora Beauty Insider | Tiered status plus a points shop where scarce items — limited samples — are the redemption. Status, not cash. | Strong. Scarcity is cheap to fund when the scarce thing is access, not inventory. |
| Chick-fil-A One / Panera Sip Club | Subscription-as-loyalty: flat fee, unlimited within a category. Converts frequency into prepaid certainty. | Needs proven frequency first; prepayment raises the same gate as a float. |
| Monzo / Revolut | Onboarding as a game — progress bars, a card-arrival ceremony, "you spent X% less on Y". Fintech gamification with no points at all. | Strong and cheap. Works at any N because it is single-player. |
| Fetch | One simple repeatable action (scan a receipt) earning a reward the user already understands (gift cards). | Useful for cross-merchant reach without merchant integration, but reward fulfilment must be funded and receipts verified. |
| Fold / Lolli | Volatile crypto-back — the Amex trick with a different volatility source. | Ruled out by the strategy's explicit exclusion of cryptocurrency conversion. Listed for completeness. |
| Yuka / Too Good To Go | Mission alignment as the loop. No currency at all — the score *is* the product. | Strong fit with Barrels Passport and with a "support local business" framing. |
| Finch | Character-driven progress; a virtual pet gives progress emotional meaning. | Single-player, no reward pool, no liability. Fit depends heavily on audience. |
| Robinhood | Referral pays a free stock — a variable-value scratch card. Very effective, very regulated. | Study the mechanic, not the compliance posture. Conflicts with the randomized-prize exclusion. |
| Nubank / PicPay (LatAm) | Closest structural analogue: lower-trust banking environment, referral-led growth, app as the primary financial relationship. | The most instructive comparison set in this list for market conditions, as distinct from mechanics. |

## What transfers to a ~114,000-person market

Most published loyalty writing assumes engagement mechanics that need volume.
The constraints below are what survive at Grenada's scale.

- **Leaderboards fail at small N; streaks do not.** A leaderboard with 200 users
  is a list of the same three people. A streak competes against the user's own
  history and works with one user.
- **Punch cards beat points at low frequency.** "Buy 9, get 1" is legible on day
  one. A points balance only feels like it is moving if purchases are frequent;
  at low frequency it reads as a number that never changes.
- **Status is stronger at small scale, not weaker.** A "top customer" badge means
  nothing in a large city and quite a lot in St. George's, where the merchant
  knows the customer by name. Social proof is cheaper *and* more potent here.
- **Loyalty is a feature of the transaction, not a destination.** Consistent with
  the Starbucks lesson and with the strategy's position that Barrels is a
  transaction layer rather than an everything app.
- **Liability is real.** Points are an accounting liability carried on breakage
  assumptions. A merchant-funded discount is not. For a small merchant network,
  merchant-funded is the structure most likely to survive contact with reality.

## Open questions carried forward

The strategy currently excludes several of the mechanics above. Three of those
exclusions are worth re-testing; one is not a matter of preference.

| Mechanic | Current strategy position | Why it is worth revisiting | What would have to be true |
| --- | --- | --- | --- |
| Streaks, including paid repair | Excluded as "manipulative streaks" | Streaks are the one engagement mechanic that provably works at small N, and the objection is to coercive framing rather than to the mechanic. A streak over *real-world* actions — events attended, parishes visited — is not screen-time farming. | A definition that separates rewarding completed real-world actions from rewarding app opens, plus a decision on whether paid repair is acceptable at all |
| Variable-value rewards | Implied by "points need clear value" and the exclusion of randomized prize mechanics | Amex and Robinhood both show ambiguous, occasionally-spectacular rewards retain better than fixed percentages. The strategy's preference for legibility may be costing real retention. | Consumer-protection review, a floor value that is never worse than the legible alternative, and clarity that this is not a game of chance |
| Relegating leagues | Excluded as public spending leaderboards | The objection is to ranking people by spend, which is sound. Ranking by non-monetary Passport progress raises none of the same concerns — but still fails on N. | A cohort large enough to make a league feel populated, and a ranked dimension that is not spending |
| Preloaded balance / prepaid float | Excluded as an unapproved stored-value wallet | **Not primarily a strategy preference.** A customer balance held by Barrels is a regulated activity; the ECCB payment-services and e-money regime applies in the ECCU. Open-mindedness does not move this one — legal advice does. | Counsel's opinion on licensing, safeguarding of customer funds, and settlement, obtained before any design work, not after |

The first three are genuine open questions and should be reopened with evidence
when loyalty leaves *Explore*. The fourth is a licensing gate.

## Before this leaves Explore

This study is not a discovery. Promotion out of *Explore* would still require,
at minimum:

1. A funding decision — merchant-funded or platform-funded — made explicitly,
   because it constrains every mechanic.
2. Evidence of merchant appetite from real merchants, not from analogy. The
   Events v1 definition's warning about related-party evidence applies here too.
3. Transaction frequency data from an Events pilot, since frequency decides
   punch-card versus points.
4. Regulatory advice on anything holding customer value.
5. Accounting treatment for any reward Barrels itself funds, including breakage.
6. A reward-ledger design covering pending and confirmed entries, refund
   reversals, unique transaction references, redemption limits, duplicate
   check-in prevention, suspicious-activity review, and audited manual
   adjustments — as the strategy already requires.

## Related documents

- [Barrels Grenada Product Strategy](barrels-product-strategy.md) — the
  authoritative loyalty position
- [Barrels Portfolio Implementation Plan](../portfolio/barrels-portfolio-implementation-plan.md)
  — horizon and investment sequence
- [Barrels Events v1 Product Definition](../products/barrels-events-v1-definition.md)
  — the transaction the first loyalty mechanic would attach to
