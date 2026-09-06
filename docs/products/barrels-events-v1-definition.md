# Barrels Events — v1 Product Definition

**Status:** Draft for approval — clears the *Now* exit gate in [`barrels-portfolio-implementation-plan.md`](../portfolio/barrels-portfolio-implementation-plan.md) (lines 77-80)
**Effective:** 2026-08-28
**Owner:** Barrels product owner
**Surface:** `apps/web/events` (`@barrelsgd/web-events`, port 3009)

The gate requires an approved problem statement, actor model, operational loop,
payment/payout feasibility decision, and pilot acceptance criteria. Sections 1-3
and 5 below are decidable now. Section 4 is externally blocked and says so.

## Evidence base and its limits

Written from a private research vault survey (2026-08-28): one organiser's
2016–2026 archive plus a Grenadian press corpus. Three limits carry into every
section below and must not be lost:

- **Phase 0 discovery never ran.** Zero external organiser interviews, zero
  attendee interviews.
- **Both pilot candidates are related parties.** Feel Free Promotions is
  classified in Barrels' own controls page as a "related-party/captive launch
  customer". A Barrels-produced Spicemas 2027 event is in-house too. Neither
  demonstrates that an independent organiser will switch.
- **Go2Fete is the incumbent** across at least seven unrelated organisers
  (2023–2026), and sponsors several of them. Why organisers would leave it is
  **unknown** — none has been asked.

## 1. Problem statement

Grenadian ticketed events sell through **several channels at once** and
reconcile them by hand.

Observed: Colours Explosion 2023 sold at "Marian, St. George's, Grand Anse,
Woburn, and Go2Fete"; the 2024 edition "tracked door and Go2Fete sections"
separately. Across roughly 750 lines of the current event's operational
checklist there is no mention of QR codes, scanning, or ticketing software —
the tools are a whiteboard bracket, printed lists, and "cash boxes per station
(bar, food, bingo cards)".

Two consequences the organiser absorbs today:

- **No single answer to "how many are sold, and how many are in?"** until after
  the event, if ever. Attendance for the best-documented event in the archive
  "is not directly confirmed".
- **Reconciliation must survive an unreliable card rail.** ECCB commissioned an
  independent audit after Republic Bank posted delayed e-commerce and POS
  transactions dating to 2022, affecting ~12,112 customers across five ECCU
  countries; duplicate charges at two IGA terminals followed six weeks later.
  Delayed and duplicated postings are lived local experience here, not a
  theoretical edge case.

**v1 solves:** one inventory and one ledger across online, physical outlets, and
the door — with reconciliation as a first-class surface rather than a report.

**v1 does not solve:** bar and food revenue. That is 60–75% of takings at ~100%
markup, handled in cash across separate boxes. The console must not be modelled
as capturing event revenue, and its fee cannot be reasoned about as a share of
gross turnover.

## 2. Actor model

| Actor | Can do | Cannot do |
|---|---|---|
| **Verified organiser** | Create events, set tiers and capacity, publish, issue and void tickets, see sales and reconciliation, initiate refunds | Publish without verification |
| **Outlet seller** | Sell against shared inventory at a physical location; settle takings to the organiser | See other outlets' or the organiser's totals |
| **Door staff** | Admit ticket holders; look up an attendee manually; work from a printed manifest | Alter inventory, pricing, or entitlements |
| **Attendee** | Discover events without signing in; buy; hold a digital ticket; request a refund | — |
| **Barrels support / moderator** | Review resident event suggestions before publication; act on support and refund escalations; read audit history | Publish on an organiser's behalf without record |

Per [`barrels-product-strategy.md`](../strategy/barrels-product-strategy.md):
publishing is restricted to verified organisers; residents may suggest missing
events but suggestions require review before publication. Trust signals
(verified purchaser, attendee, organiser) are separate from any spendable
reward and must not be purchasable or transferable.

## 3. Operational loop

Canonical loop, per [`apps/web/events/CLAUDE.md`](../../apps/web/events/CLAUDE.md):
**event setup → ticket sale → admission → settlement.**

### Setup
Organiser defines event, tiers, capacity, and outlets. Capacity is one pool;
every channel draws from it.

### Sale
Online checkout plus outlet allocations plus door sales, all decrementing the
same inventory. Two entitlement behaviours are required at v1 — both observed in
the record, neither exotic:

- **Postponement:** tickets "honoured at the new date" (SpiceLaugh, 2024).
- **Carry-forward:** semifinal tickets "valid for the final event" (Youth in
  Groovy, 2024).

### Admission — online, with a printed fallback

Admission is an **append-only scan log**. Each scan carries a client-generated
idempotency key, a device id, and a client timestamp. A ticket's admitted state
is a **projection over that log**; the server is authoritative on ordering.

v1 writes scans online and synchronously. The degradation path is a
**printable door manifest**, which is parity with how these organisers already
work — paper lists and whiteboards are the current system, not a failure state.

**Offline scanning is deliberately out of v1.** Its stated origin is
[`docs/grenada-streaming-events-brief.md:134`](../grenada-streaming-events-brief.md)
("offline scanner from day one"), a document self-labelled *brainstorm / early
product definition — nothing here is built yet*. It hardened into a *Next* exit
gate with no intervening measurement: the vault records no venue connectivity
test, no door-throughput figure, and no gate outage. The costly part of offline
is not caching but double-admission across devices that cannot see each other —
real conflict-resolution work, currently justified by nothing.

The log shape above makes offline **additive**: buffer the same events locally
and replay them. No schema change, no rewrite.

**Open action:** take one connectivity reading at Marian Playing Field during
the October event, before the pilot commits to online-only admission.

### Settlement
One ledger across all channels. Must tolerate delayed and duplicated card
postings, expose unmatched items rather than hiding them, and reconcile outlet
cash against issued inventory.

## 4. Payment and payout feasibility — BLOCKED

**This section cannot be completed and the gate cannot close without it.**

Two candidate providers. **Republic ePay is now the likely choice**, with WiPay
the alternative.

### Republic ePay — published position

From [the product page](https://republicgrenada.com/commercial/republic-epay),
2026-08-28:

| Item | Stated |
|---|---|
| Accepts | "Any Visa/MasterCard branded Credit Card"; "International Visa Debit Card – currently supported by certain Banks' cards" |
| Settlement to merchant account | "within two to three business days" |
| Fees | "Merchant Credit Card Commission Rate (subject to confirmation upon assessment)" plus gateway processing fees by package — **no rates published** |
| Onboarding | Merchant Services Application Form → `rbgdbusinesscentre@rfhl.com` or a branch; "as little as four (4) working days" |
| Included | 3D Secure, chargeback management, recurring billing, customised reporting |

**Not stated anywhere on that page: any API, webhooks, developer documentation,
sandbox, or refund API.** The integration options described are a payment
button, a hosted web store, and website integration. Currency is not stated
either — XCD is assumed for Grenada but unconfirmed.

### Why this is an architecture question, not a vendor question

1. **Ticket issuance needs a server-side payment confirmation.** If ePay
   confirms only by browser redirect, a buyer who closes the tab has paid and
   holds no ticket — producing exactly the unmatched-payment queue this product
   exists to eliminate. Whether a webhook or a server-to-server verification
   call exists is the single most important unknown in this document.
2. **The reconciliation surface is now aimed at a documented failure mode, not
   a generic one.** Republic Bank is the same institution whose rails posted
   delayed e-commerce and POS transactions dating to 2022 (~12,112 ECCU
   customers, ECCB-commissioned audit) and double-charged two IGA terminals six
   weeks later. Building settlement to expose unmatched and duplicated postings
   is a direct requirement against the chosen provider's own history.
3. **Two-to-three-day settlement plus outlet cash** means organiser payout
   timing must be modelled explicitly; money is not available at event close.

### Still unknown

| Item | State |
|---|---|
| ePay: webhook / server-side confirmation | **Unknown — ask before designing checkout** |
| ePay: actual commission and package rates | **Unknown** — quoted only on assessment |
| ePay: refund and chargeback mechanics | **Unknown** — managed service described, no interface documented |
| Settlement currency (XCD?) | **Unconfirmed** |
| WiPay KYC (alternative path) | Account opened, verification outstanding |
| Whether Barrels needs a licence to hold ticket money | **Unknown** — Payment System and Services Act No. 8 of 2025 |
| Mandatory refund window or cancellation remedy | **Unknown** — Consumer Protection Act 2/2018 text not read |
| Card penetration / attendee payment mix | **Unknown** |
| Platform fee organisers would tolerate | **Unknown** — no organiser has been asked |

Nothing here should be assumed to unblock design work elsewhere. The licensing
question is upstream of the whole product: it decides whether Barrels may take
ticket money at all. **Do not design checkout until the confirmation mechanism
is known** — it determines whether ticket issuance can be reliable.

Applicable regime beyond payments: **Data Protection Act 1/2023** (subject
rights, Information Commission, no published adequacy list — cross-border
transfers may need safeguards), **Electronic Transactions Act 21/2013**
(electronic contracts valid), **Electronic Evidence Act 13/2013** (audit trails
admissible given timestamps and chain of custody — relevant to the scan log).

## 5. Pilot acceptance criteria

The portfolio plan's *Next* exit gate is: *"A trusted organiser completes an
Events pilot and reconciliation succeeds."* Its metric row (line 150) names
verified organisers, event coverage, purchase completion, admission success,
reconciliation accuracy, and support/refund resolution.

A pilot passes when, for one real event:

1. A verified organiser completes setup, publication, and sale **without
   Barrels operating the console for them**.
2. Inventory stays consistent across online, at least one physical outlet, and
   the door — sold never exceeds capacity.
3. Every admission is recorded in the scan log; duplicate scans of one ticket
   are rejected and visible.
4. The printed manifest is produced and is sufficient to run the door unaided
   for the length of any outage.
5. Settlement reconciles: issued vs sold vs admitted vs collected, with
   unmatched items enumerated, not silently absorbed.
6. At least one refund or postponement is processed end to end.

**Explicitly not proven by this pilot:** that an independent organiser will
adopt the product. Both candidate events are related parties. Treat the pilot as
an operational rehearsal, not market validation.

## Out of scope for v1

Comments, follower counts, open-ended public posting, influencer mechanics and
engagement feeds — excluded by
[`barrels-product-strategy.md`](../strategy/barrels-product-strategy.md).
Offline scanning (see §3). Bar, food, and vendor cash (see §1).

## Open questions

1. **Does Republic ePay provide a webhook or server-side payment verification?**
   Ask on the merchant assessment call. Blocks checkout design.
2. Republic ePay commission and package rates — quoted only on assessment.
3. Settlement currency and refund/chargeback mechanics for ePay.
4. Does the Payment System and Services Act require a licence for this model?
5. Does Grenadian law impose a mandatory refund window?
6. Connectivity at Marian Playing Field — one measurement, October.
7. Why would an organiser leave Go2Fete? Unanswered; needs a real interview.
8. What platform fee is tolerable? No basis for a number yet.
