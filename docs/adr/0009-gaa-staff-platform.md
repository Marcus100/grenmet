# ADR-0009: GAA Staff Platform (Piloted In Meteorology)

## Status

Proposed

## Context

What began as HR forms for the Meteorology department is intended to grow into a
staff platform for the **entire Grenada Airports Authority (GAA)** — 250+ staff
across departments with very different operating models: Meteorology, Air Traffic
Services (which contains AIS/AIM), Security, HR, Accounts, IT, and more. Some run
24/7 rotating shifts (ATS, Security); others are office-hours (Accounts, IT).

Planned modules beyond HR forms: time-check/attendance, tickets/requests, a
janitor task app, a staff bus app, and eventually payroll. These share far more
than they differ — the same people, org structure, approvals, notifications, and
audit needs recur in every one. Building them as isolated apps would duplicate
that plumbing five times and drift out of consistency.

This ADR records the platform decisions that every module (starting with HR —
see ADR-0008) is built on. It is a companion to ADR-0008, which covers the HR
approval workflow specifically.

## Decision

Build a single **modular-monolith staff platform** in the existing FastAPI
backend and admin-gms web app, piloted in Meteorology and rolled out
department-by-department. Each new capability is a module on a shared core, not a
separate service.

### Shared core (build once, reuse everywhere)

| Core capability | What it provides | Status |
| --- | --- | --- |
| Approval workflow engine | General draft→pending→approved routing any module can request | Exists (`hr/workflow`); extended per ADR-0008 |
| Employee/roster registry | Single authoritative store of staff, org units, employment, schedule ("roster-as-brain") | Partial; extend platform-wide |
| Notifications | One delivery service: email now, push later | New |
| Audit + documents | Central audit log + shared document/PDF generation | Audit partial; document gen new |

Modules (`hr`, `timecheck`, `tickets`, `janitor`, `bus`, `payroll`, …) depend on
the core, never on each other's internals.

### Organisation model

Model the org as a **hierarchical tree** (GAA → department → section → unit; e.g.
ATS → AIS/AIM). Approval routing and data visibility **follow the branch**: a
section head approves their section; a director sees their whole branch;
department scoping is the default isolation (Security cannot see Met's data,
cross-department roles like HR/Accounts are granted wider scope explicitly). This
extends the existing `RoleAssignmentScope` (SELF / DEPARTMENT / ALL) toward
tree-aware scoping.

### Identity

The platform **owns accounts** (username/password + the existing opaque-session
auth from ADR-0002). Auth is kept **pluggable** so SSO against a GAA identity
provider can be added later without reworking modules, if/when GAA standardises on
one.

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
`--gm-*` tokens (no hardcoded values), light/dark aware.

## Rollout / module roadmap

1. **HR approval workflow** (now) — first module, proves the engine + core
   (ADR-0008).
2. **Time-check / attendance** (next) — clock-in as above; feeds timesheets and,
   later, payroll.
3. **Tickets / requests** — helpdesk-style routing; heavy reuse of the workflow
   engine.
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
