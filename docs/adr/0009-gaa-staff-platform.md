# ADR-0009: GAA Staff Platform (Piloted In Meteorology)

## Status

Proposed

## Context

What began as HR forms for the Meteorology department is intended to grow into a
staff platform for the **entire Grenada Airports Authority (GAA)** — 250+ staff
across departments with very different operating models: Meteorology, Air Traffic
Services (which contains AIS/AIM), Security, HR, Accounts, IT, and more. Some run
24/7 rotating shifts (ATS, Security); others are office-hours (Accounts, IT).

Planned modules beyond HR forms: time-check/attendance, staff requests
(helpdesk-style), a janitor task app, a staff bus app, and eventually payroll. These share far more
than they differ — the same people, org structure, approvals, notifications, and
audit needs recur in every one. Building them as isolated apps would duplicate
that plumbing five times and drift out of consistency.

This ADR records the platform decisions that every module (starting with HR —
see ADR-0008) is built on. It is a companion to ADR-0008, which covers the HR
approval workflow specifically.

## Decision

Build a single **modular-monolith staff platform** in the existing FastAPI
backend and the GAA staff portal web app (`apps/web/admin-gms`, renamed to
`apps/web/gaa-admin` / `@barrelsgd/web-gaa-admin` at transition boundary 7),
piloted in Meteorology and rolled out department-by-department. Each new capability is a module on a shared core, not a
separate service.

### Shared core (build once, reuse everywhere)

| Core capability | What it provides | Status |
| --- | --- | --- |
| Approval workflow engine | General draft→pending→approved routing any module can request | Exists (`hr/workflow`); extended per ADR-0008 |
| Employee/roster registry | Single authoritative store of staff, org units, employment, schedule ("roster-as-brain") | Partial; extend platform-wide |
| Notifications | One delivery service: email now, push later | New |
| Audit + documents | Central audit log + shared document/PDF generation | Audit partial; document gen new |

Modules (`hr`, `timecheck`, `requests`, `janitor`, `bus`, `payroll`, …) depend on
the core, never on each other's internals.

**Naming:** the staff helpdesk module is `requests`, never `tickets`. "Tickets"
is reserved for the Barrels Events product, which sells admission to events. The
two are unrelated domains and sharing the word would collide in packages, routes,
and tables.

### Organisation model

Model the org as a **hierarchical tree** (organisation → department → section →
unit; e.g. GAA → ATS → AIS/AIM). Approval routing and data visibility **follow the
branch**: a section head approves their section; a director sees their whole
branch; department scoping is the default isolation (Security cannot see Met's
data, cross-department roles like HR/Accounts are granted wider scope explicitly).
This extends the existing `RoleAssignmentScope` (SELF / DEPARTMENT / ALL) toward
tree-aware scoping.

**Tenant scoping is added now, not retrofitted.** The HR capability is intended
to become a Barrels product sold to other organisations, with GAA as the first
customer. The tree is therefore rooted at an **organisation**, not at GAA:
`organisation_id` is carried through schemas from the outset, and department
configuration — approval chains, shift types, roles — is data-driven rather than
hardcoded to GAA.

This is deliberately narrower than full multi-tenancy: no tenant isolation
guarantees, billing, or self-service onboarding are built now. The decision is
only that no schema, scope, or query may assume a single organisation, because
unpicking that assumption after timecheck, requests, and payroll are built on it
is far more expensive than carrying the column from the start.

Adding `organisation_id` touches Drizzle schemas and FastAPI models, both of
which are Ask-First changes requiring explicit approval and a migration before
any implementation begins.

### Identity

**One central login, operated by Barrels.** Identity is not per-app and not
per-department: staff sign in once at the shared `auth` surface (ADR-0002), which
issues an opaque session cookie that server-side app code exchanges for a
short-lived FastAPI access token. Account records live in the FastAPI backend
alongside the employee registry, so "the platform owns accounts" means it is the
system of record for identity — not that it runs a second, separate login.

Barrels operates that identity service and intends to keep doing so. Auth stays
**pluggable** so SSO against a GAA identity provider can be added later without
reworking modules, if GAA standardises on one or declines to have its staff
credentials held by a supplier. That is a client decision, not a technical
constraint, and the pluggability exists so it can be taken later without a
rewrite.

**Shared identity, per-application authorization.** One account may be used
across several Barrels applications, but holding an account grants access to
nothing by itself. Access is granted per application, and roles are configured
per application rather than globally, so the same person can be an approver in
one app, read-only in another, and absent from a third.

Role assignment today is `(user, role, scope)` where scope is
`SELF | DEPARTMENT | ALL`. It carries no application and no organisation
dimension, so it cannot express any of the above. Reaching this model means role
assignment becomes:

```
(user, organisation, application, role, scope)
```

- **organisation** — the tenant, per the organisation model above.
- **application** — which Barrels application the grant applies to. Absent grant
  means no access, not default access.
- **role** and **scope** — as today, extended toward tree-aware scoping.

Both new dimensions belong to the same change. Adding one without the other
produces either roles that leak across applications or applications that cannot
be scoped to a tenant.

This is a `packages/auth` and FastAPI model change with blast radius across every
app that authenticates, and is Ask-First on both counts. It is recorded here as
the intended destination, not as approval to implement.

### Rostering

**One roster engine, per-department configuration.** Each department defines its
own shift types and rotation templates (ATS 24/7 rotating, Security shifts,
Accounts 9–5); roster-as-brain remains the single source of truth that every
module reads (attendance compares against it; leave writes into it).

### Time-check / attendance (the next module)

App-only clock-in in the PWA — no badge/access-control integration.

- **Presence proof = a static site token**, submitted via a **method-agnostic**
  clock-in endpoint. Delivery methods are interchangeable front-end details:
  **NFC stickers** (Android majority — Web NFC is Android-Chrome only) and **QR
  posters** carrying the same token (iPhone users and NFC-failure fallback; Web
  NFC is unavailable on iOS PWAs). GPS can slot in later behind the same endpoint.
- **Static token for the pilot** (accepts the photograph-the-tag risk); rotating
  codes are a later hardening step.
- **Shift-aware:** each punch is matched against the rostered shift to flag
  late/early/overtime rather than logging a raw time.
- **Corrections:** employee requests a fix (forgot to clock out, wrong time) →
  supervisor approves, reusing the approval engine; fully audited.
- **No-phone staff:** deferred for the Met pilot (assume phones); a shared site
  kiosk is added when rolling into phone-light departments (e.g. janitorial).

### Client / mobile strategy

**One codebase: an installable, responsive PWA.** Staff-facing surfaces
(clock-in, janitor tasks, bus sign-up, self-service) are phone-first, add-to-home
-screen, offline-capable as a later step. No native app / app-store track.

### Form UX

**Smart prefill, all editable.** Forms open pre-filled from profile + roster +
the user's last submission, remembering recent values; every field stays editable
with an override always available.

### Roster UI redesign

Move the roster to a **clean, neutral, modern** layout (calendar-app feel):
mostly neutral surfaces, generous spacing, shift types as small tasteful
colour-coded chips rather than large colour blocks. All colour via design-system
tokens (no hardcoded values), light/dark aware.

### Design systems are per brand, not shared

Each brand owns its own design system: Barrels Grenada, GMS, and GAA each have
one, and individual apps may have their own where their audience requires it —
Signal and MBIA already do. `--gm-*` is **exclusive to GMS surfaces** and must not
style the platform shell or other departments' modules; GAA surfaces use `--gaa-*`,
which already exists in the MBIA site.

This amends the original text of this ADR, which specified `--gm-*` platform-wide.
That predated the clarification that GMS is a *department of* GAA rather than a
peer, which makes GMS tokens the wrong default for a GAA-wide platform.

Platform chrome is therefore GAA-branded, and each department's modules carry
their own department tokens. This depends on the neutral token contracts in
transition boundary 3: without them, every module inherits whichever palette
happens to ship in shared UI.

## Rollout / module roadmap

1. **HR approval workflow** (now) — first module, proves the engine + core
   (ADR-0008).
2. **Time-check / attendance** (next) — clock-in as above; feeds timesheets and,
   later, payroll.
3. **Requests** — staff helpdesk-style routing; heavy reuse of the workflow
   engine. Not to be called tickets; see the naming note above.
4. **Janitor app** — phone-first task/checklist app.
5. **Staff bus app** — phone-first schedule + sign-up.
6. **Payroll** — deferred; keep attendance/leave data clean and payroll-ready so
   either "export to existing payroll" or "compute in-app" stays open.

Delivery is **Meteorology pilot → harden → onboard departments one at a time**,
each self-configuring its approval chains, shift patterns, and roles.

## Consequences

- Every module inherits the same approvals, org model, notifications, and audit —
  consistency by construction, and new modules are mostly domain logic, not
  plumbing.
- The shared core becomes a critical dependency: changes to workflow, the employee
  registry, notifications, or audit have platform-wide blast radius and must be
  treated as such.
- The org tree and tree-aware scoping are foundational; getting department →
  section → unit and its visibility rules right early avoids painful re-modelling
  once multiple departments are live.
- Platform-owned identity means GAA joiner/leaver management lives here until (if)
  SSO is added; auth must stay pluggable to keep that door open.
- One PWA for all staff apps keeps releases instant and cross-platform, but means
  device-native capabilities (e.g. iOS NFC, background push) are constrained by
  the web platform — accepted deliberately (drove the NFC-Android + QR-iOS split).
- Attendance is only as trustworthy as a static on-site token until rotating codes
  land; acceptable for the pilot, revisited before org-wide rollout.
- Payroll is intentionally unplanned beyond "keep data payroll-ready"; that
  decision is deferred, not designed here.
- Rolling out per department spreads effort and risk but requires per-department
  configuration (chains, shifts, roles) to be first-class, not hardcoded to Met.
- Carrying `organisation_id` from the start costs a migration and some query
  complexity now, in exchange for keeping the HR product sellable without a
  schema rewrite. It does not by itself make the platform multi-tenant.
- Per-brand design systems mean more token sets to maintain and a real risk of
  drift between them; the neutral contracts in transition boundary 3 are what stop
  each app reinventing its own primitives underneath its own palette.
