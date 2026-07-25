# Barrels Grenada Product Strategy

**Status:** Working strategy  
**Recorded:** 2026-07-19  
**Horizon:** Five years  
**Owner:** Barrels Grenada

## Purpose

This document defines the product and business direction for Barrels Grenada.
It describes what Barrels should become, who it serves, how its products work
together, and how progress should be measured.

This strategy works alongside the
[Barrels Grenada Platform Transition](../exec-plans/barrelsgd-transition.md).
The transition plan defines the near-term repository, product, domain, and
infrastructure changes. This document defines the five-year destination those
foundations should support.

This document does not authorize implementation, infrastructure changes,
payment processing, regulated activity, or changes to the transition plan.
Each initiative still requires its own discovery, approval, implementation
boundary, and verification.

## Strategic identity

Barrels Grenada is primarily a software product company. It may provide
implementation and integration services when those services help institutions
and businesses adopt Barrels products or strengthen reusable platform
capabilities.

Barrels should not become a collection of unrelated custom-software projects.
Implementation work should produce configuration, connectors, and reusable
capabilities rather than permanent customer-specific forks.

### Mission

> Every interaction between a person and an organization in Grenada should
> become faster, simpler, and more trustworthy because Barrels exists.

### Product thesis

> Barrels is Grenada's trusted digital transaction layer: the platform through
> which people discover, access, pay for, and manage local goods and services.

Barrels is not merely an everything app. An everything app collects unrelated
features. A transaction layer provides reusable infrastructure for exchanging
information, money, goods, and services across many products and sectors.

### Five-year ambition

> Make Grenada the easiest country in the Caribbean to discover, access,
> deliver, and pay for local services, and make it dramatically easier for
> organizations to operate digitally.

The primary user is a person living in Grenada. Visitors, the diaspora,
businesses, institutions, and government agencies are additional audiences
served through appropriate experiences.

## Core product philosophy

Barrels should reduce the friction between intention and action:

```text
Discover -> Compare -> Trust -> Book or order -> Pay -> Track -> Receive
         -> Review -> Return
```

The desired visit is:

```text
Intent -> Action -> Transaction -> Leave
```

Barrels should maximize value created per visit, not time spent in the app. A
short visit is successful when a person quickly finds an event, buys a ticket,
checks an alert, makes a booking, or completes another real-world task.

The personalized home experience should help a resident answer:

1. What do I need to know today?
2. What is happening nearby?
3. What needs my attention?
4. What relevant opportunities exist?
5. What can I accomplish now?

Weather, public alerts, events, transportation, bills, bookings, deals, and
services should appear as useful, actionable information rather than an
infinite feed.

## Product model

### Barrels App

The resident-facing experience for discovery and transactions. In accordance
with the transition plan, `barrels.gd` begins as the Barrels corporate hub. It
should progressively become the public Barrels experience as resident services
launch. Company information can remain available within that experience.

The Barrels App should eventually provide one coherent entry point without
forcing every product into one application, deployment, or code boundary.

### Barrels Business

The organization-facing operating experience. Verified organizations should
eventually be able to manage relevant combinations of:

- Public profiles, locations, products, and services
- Events, bookings, orders, and customer requests
- Payments, refunds, receipts, and settlement information
- Customer communication and notifications
- Staff access and operational roles
- Promotions and loyalty programmes
- Operational reporting and analytics

The goal is to reduce the time and cost between customer intent and business
fulfilment and to let an organization manage its digital operations from
anywhere.

Barrels Business should not be confused with the internal Barrels control plane
at `admin.barrels.gd` described by the transition plan.

### Barrels Platform

Reusable capabilities shared where product needs justify them:

- Identity, authentication, and organization accounts
- Business, service, event, and location records
- Search, discovery, and recommendations
- Booking, ordering, registration, and ticketing
- Payment-provider integrations
- Notifications and transactional messaging
- Maps and location services
- Reviews and trust signals
- Documents, tickets, invoices, and receipts
- Loyalty and rewards
- Operational analytics
- AI-assisted discovery, support, and operations

Capabilities should be introduced to solve demonstrated product needs. A
shared platform must not become an excuse to build speculative infrastructure
before a product requires it.

### Product portfolio

GrenMet, Signal, MBIA, GAA, Events/Tickets, future HR, and other future
products retain clear identities and responsibilities. They may consume
Barrels Platform capabilities where doing so reduces duplication without
erasing product or institutional boundaries.

The existing transition plan remains authoritative for the near-term
boundaries among Barrels, GrenMet, the Grenada Meteorological Service, Signal,
MBIA, and GAA.

## First transactional product: Events and Tickets

Barrels Events and Barrels Tickets should begin as one product with event
discovery and ticketing modules. Split them only if their branding or operations
materially diverge.

Events/Tickets is a separate initiative after the relevant transition
foundations; it is not hidden scope within the platform transition.

### Why Events/Tickets comes first

Events provides an understandable end-to-end transaction while exercising
capabilities that can later support other verticals:

- Organization identity and verification
- Listings, search, recommendations, dates, and locations
- Registration, checkout, and payments
- Digital fulfilment through tickets
- Notifications, cancellation, and refunds
- Operational dashboards and analytics
- On-site verification and customer support

It is operationally narrower than food delivery and generally less complex
than beginning with regulated financial services.

### Recommended initial scope

- Public event discovery without mandatory sign-in
- Verified organizer accounts
- Free public events
- Registration-based events
- Paid ticketed events
- Event pages, search, filters, categories, dates, and locations
- Organizer event creation and controlled publishing
- Checkout through approved payment providers
- Digital tickets and QR-based check-in
- Cancellation and refund workflows
- Transactional email and notifications
- Organizer sales and attendance reporting
- Moderation, audit history, and support tools

Event publishing should initially be restricted to verified organizers.
Residents may suggest missing events, but suggestions should require review
before publication.

Comments, follower counts, open-ended public posting, influencer mechanics,
and engagement-oriented feeds are outside the initial product.

## Business model

### Initial revenue

- Annual institutional software and support agreements
- Paid implementation and integration work
- Hosting and managed-service agreements
- Transparent service fees on paid event tickets

The resident-facing core should remain free during the initial strategy period.
Advertising and resident subscriptions should not be the primary early revenue
model because adoption and trust are more important than maximizing revenue per
visit.

### Later revenue options

- Business software subscriptions
- Booking and transaction fees
- Premium operational tools
- Clearly labelled verified promotional placements
- API and integration plans

New revenue models should be evaluated against accessibility, business value,
trust, regulatory obligations, and their effect on marketplace fairness.

## Loyalty and responsible gamification

Loyalty should reward completed real-world actions, not attention or screen
time. It should have three separate concepts.

### Merchant rewards

Businesses fund and control their own offers while Barrels provides the
infrastructure. Examples include digital stamp cards, repeat-purchase rewards,
ticket credits, discounts, upgrades, and early access.

Merchant-specific rewards should precede a universal points programme. They
are easier to explain, fund, account for, and test.

### Barrels Passport

Non-monetary challenges can encourage useful discovery without creating a
social network. Examples include attending cultural events, visiting multiple
parishes, exploring Carriacou or Petite Martinique, supporting new local
businesses, or completing a festival trail.

Users may receive stamps, badges, collections, and occasional sponsored
benefits. Avoid public spending leaderboards, randomized prize mechanics,
manipulative streaks, and rewards for repeatedly opening the app.

### Trust signals

Verified purchaser, verified attendee, verified organizer, and established
business indicators should be separate from spendable rewards. Trust must not
be purchasable, transferable, or based primarily on popularity.

### Universal Barrels Points

A cross-business points programme should be considered only after merchant
rewards and Events/Tickets demonstrate demand and sound operations. If
introduced, points need clear value, funding, expiration, refund, settlement,
accounting, fraud, privacy, and regulatory rules.

Initially avoid cash withdrawals, person-to-person transfers, speculative
point purchases, cryptocurrency conversion, and any design that functions as
an unapproved stored-value wallet.

The reward system should support pending and confirmed entries, automatic
refund reversals, unique transaction references, redemption limits, duplicate
check-in prevention, suspicious-activity review, and audited manual
adjustments.

## AI and personalization

AI should make reliable information easier to understand and actions easier to
complete. Useful applications include:

- Personalizing relevant events, alerts, services, and opportunities
- Summarizing what matters today
- Improving search and service discovery
- Helping organizers prepare event information
- Assisting business operators with reporting and routine work
- Supporting customers through transactional workflows

AI is an enabling capability, not the primary product. Recommendations should
be explainable where practical, personalization should be controllable, and
high-impact actions should remain under user or authorized organizational
control.

## Trust, data, and resilience

The guiding model is one platform with distributed ownership.

- Organizations retain appropriate ownership of their operational data.
- Organizations can export their data in usable formats.
- Customer and operational data is isolated between organizations.
- Users receive meaningful consent and personalization controls.
- Sensitive and administrative actions have audit records.
- Paid placement is clearly labelled.
- Reviews and trust signals are connected to credible interactions where
  practical.
- Essential records and exit procedures account for outages and service
  discontinuation.
- Barrels does not sell sensitive personal or institutional data.

Privacy, consumer protection, payments, identity, data retention, and other
regulated areas require specific legal and operational review before launch.

## Strategic boundaries

Barrels should not become:

- A conventional social-media platform
- A product optimized for addictive engagement or infinite scrolling
- A bank, speculative fintech company, or unapproved custodial wallet
- A restaurant, retailer, promoter, utility, or government agency
- A delivery-fleet operator without strong evidence that ownership is required
- A telecommunications, semiconductor, or hardware manufacturer
- A centralized owner of every participating organization's data
- A collection of unrelated client-specific software forks
- A closed platform that prevents reasonable data export or interoperability

Social capabilities may exist when they improve discovery, trust,
coordination, or transaction completion. They should not become the product's
purpose.

Barrels should generally buy or partner for cloud infrastructure,
telecommunications, payment rails, satellite services, data-centre hardware,
sensors, energy equipment, and consumer devices. Its advantage should come
from Grenadian knowledge, trusted relationships, integrated workflows, and
locally appropriate software.

## Recommended sequence

1. Complete approved boundaries of the Barrels platform transition while
   preserving the transition plan's product and governance rules.
2. Establish company-owned identity, shared foundations, product-aware
   authentication, deployment, and clear product boundaries.
3. Launch the `barrels.gd` corporate hub.
4. Discover and design Events/Tickets as a separately approved product.
5. Pilot Events/Tickets with a small group of trusted organizers.
6. Evolve `barrels.gd` into a personalized event-discovery and transaction
   experience.
7. Develop the organizer console into the first module of Barrels Business.
8. Stabilize organization identity, payments, notifications, refunds, search,
   support, and analytics through real Events/Tickets usage.
9. Reuse proven capabilities for bookings and service discovery.
10. Add utilities, government transactions, food ordering, commerce, or
    transportation according to evidence and institutional readiness.
11. Expand proven products across the OECS and CARICOM without exporting an
    unfinished everything app.

This sequence describes dependencies, not automatic authorization or fixed
delivery dates.

## Measures of success

Barrels should not use scrolling time as its principal measure. Track outcomes
such as:

- Successful actions completed
- Time required to complete an action
- Transaction completion and failure rates
- Event coverage across Grenada, Carriacou, and Petite Martinique
- Organizer activation and retention
- Discovery-to-registration or purchase conversion
- Successful ticket issuance and check-in
- Refund and support resolution time
- Active verified organizations
- Repeat transactions attributable to loyalty programmes
- Business operating time and cost saved
- Resident trust, accessibility, and repeat use
- Institutional renewal rates

Each product initiative should define baselines, target outcomes, and a clear
gate for deciding whether to deepen the product, expand it, or stop.

## Confirmed direction and recommendations

The following directions were explicitly confirmed during strategy discovery:

- Barrels is primarily a software product company with supporting
  implementation services.
- The long-term aim includes one coherent resident-facing Barrels App.
- People living in Grenada are its primary users.
- The initial resident proposition is trusted information and actionable local
  services rather than commerce alone.
- Institutional agreements are the initial revenue engine.
- The national ambition uses a five-year horizon.
- Events discovery and Events/Tickets form the first complete transaction
  product.
- Event publishing initially uses verified organizers.
- The product strategy and platform transition work together.
- `barrels.gd` begins as the corporate hub and evolves into the public Barrels
  experience.

Other details in this document are recommendations to validate through product
discovery, user research, institutional engagement, legal review, prototypes,
and staged delivery.
