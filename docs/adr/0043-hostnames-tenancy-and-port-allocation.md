# ADR-0043: Hostnames, tenancy and port allocation

## Status

Proposed. Owner-approved direction 2026-10-21; this ADR is phase P0 (docs and
checks only, no runtime change). Becomes Accepted when the owner merges it.

## Context

Hostnames, ports and tenant addressing grew one app at a time. The transition
plan (`docs/exec-plans/barrelsgd-transition.md`) assigned ports and hosts that
were never built (3010 salesbus, 3011 gaa-admin, `docs.weather.gd`), the
"seven places" a port lives in had drifted, and four decisions are now needed
before more products land:

- Which hostname shape do products, platform services, ops tools and client
  sites use, in production and staging?
- How is a tenant (an organisation) addressed: a subdomain, a path, a custom domain?
- How do cookies and the sign-in return-host allowlist behave when many apps
  share one brand domain?
- When is a second registrable domain required?
- How are ports allocated so they are never renumbered or reused?

Constraints: the repo is public; free and open-source tooling only; staging is
throwaway; ports 3000-3019 are live in package.json, Dockerfiles, compose, CI
and AGENTS.md files and are not worth renumbering (ports are an internal detail).

## Evidence

- **Facts**
  - `infra/docker/docker-compose.deploy.yml` routes 15 hosts with
    ``Host(`<label>.${BASE_DOMAIN}`)`` rules; `BASE_DOMAIN` is `barrels.gd` or
    `staging.barrels.gd` (`infra/docker/{production,staging}.env`). DNS is a
    wildcard. (high)
  - Session cookies are set `httpOnly`, `sameSite: "lax"`, `path: "/"` with no
    `domain` attribute, so they are already host-only
    (`packages/auth/src/server/auth-api-fetch.ts`, `app-sign-in.ts`). (high)
  - Compose passes `AUTH_ALLOWED_RETURN_HOSTS: .${BASE_DOMAIN}${EXTRA_RETURN_HOSTS:-}`
    to web apps, and `apps/web/auth/src/lib/return-to.ts` treats a leading-dot
    entry as a suffix match, so any `*.barrels.gd` host is an accepted return
    target. (high)
  - Bookings already has a public slug on organisations
    (`apps/api/fastapi/src/bookings/public.py`, `models.py`: `public_slug`). (high)
  - `admin.<domain>` and `gmsadmin.<domain>` both route to the gaa-admin
    service (port 3001); `apps/web/admin` (port 3012) is built but not deployed.
    (high)
  - `docs/weather-gd-golive.md` described dormant return-host and CORS entries
    for `weather.gd` that are not in `infra/docker/production.env`. (high; fixed
    in this change)
  - `scripts/ci/check-ports.mjs` checked only web-app ports against five files;
    it did not know ranges, retired ports, or hostnames. (high)
- **Interpretation**
  - A single brand domain with single-level hosts keeps one wildcard
    certificate and one DNS pattern; cost: every `*.barrels.gd` host shares a
    site for cookie-scope and "same-site" purposes. Best practice: with
    host-only cookies and no `Domain=`, sibling subdomains cannot read each
    other's cookies, but they can still set cookies for the parent domain if
    they run attacker-controlled content. That is why tenant-authored content
    needs a separate registrable domain (see Decision 8). (medium, best practice)
  - Tenants as paths keyed by organisation slug avoids a certificate and a
    DNS record per tenant and matches the existing `org` API zone. (medium, heuristic)
- **Uncertainty**
  - Whether tenants will ever author HTML, themes or scripts, or get DNS or
    deploy control. That is what triggers the second domain; until then it is
    not needed. Nothing here is verified against a real attack; the
    guardrails are precautionary. (low)
  - The `__Host-` prefix requires `Path=/`, `Secure` and no `Domain`. The SSO
    state cookie is scoped to `Path=/auth`, so it can only take `__Secure-`.
    Not yet tried in the code. (medium)

## Options considered

1. **Subdomain per tenant** (`acme.hr.barrels.gd`, `<org>.barrels.gd` for all
   products). Strong visual tenancy; needs three-level names, a wildcard
   certificate per product and a DNS plan per product, and weakens cookie
   isolation. Rejected.
2. **Brand domain with single-level product hosts and tenants as paths**
   (`hr.barrels.gd/<orgSlug>/...`). One certificate pattern, simple routing,
   tenant is data not infrastructure. Cost: tenant branding is path-level, and
   a client wanting its own look later needs a custom domain. **Chosen.**
3. **Per-client registrable domains from day one.** Best isolation, but needs
   a domain, certificate and DNS per client now, for no current requirement
   (free-only constraint). Deferred to "client-owned custom domains later".
4. **Renumber ports to the new categories.** Tidy, but touches six places per
   app across live apps for a number nobody sees. Rejected; 3000-3019 stay frozen.
5. **Leave ports first-come.** The status quo; it produced the unbuilt and
   conflicting claims listed under Context. Rejected.

## Decision

1. **One brand domain, `barrels.gd`, single-level hosts.** No three-level names
   such as `docs.weather.*`. Staging uses the `.staging.` infix
   (`hr.staging.barrels.gd`). Client sites are `<client>.barrels.gd` now;
   client-owned custom domains come later.
2. **Host classes.**
   - Audience/control: `auth` (Barrels ID), `admin` (Barrels staff and
     superuser console, `apps/web/admin`, port 3012), `gms` (Met office staff
     portal, today's gaa-admin, port 3001).
   - Product hosts: `bookings`, `events`, `hr`, `shop`, `signal`, `elections`,
     `gmsdash`, `cap`, `weather`, `docs`, `cms`, `mbia`. `shop` is the
     merchant-facing shopkeeping/stores app (port 3008).
   - Reserved, not built (sector products): `education`, `automotive`,
     `delivery`, `bus`, `park`, `taxi`, `homegrown`, one port each in 3035-3041,
     plus the existing salesbus POS port 3030.
   - Platform: `api` (one API host); `status` and `developers` reserved.
   - Ops: `traefik`, `adminer`. Basic auth plus an IP allowlist on staging;
     Cloudflare Access only on production.
3. **Tenants are paths on product hosts, keyed by the organisation slug
   everywhere** (`hr.barrels.gd/<orgSlug>/...`, `bookings.barrels.gd/<orgSlug>`).
   Bookings' existing `public_slug` stays as an alias that resolves to the
   same organisation.
4. **Cookies.** Host-only, `HttpOnly`, `SameSite=Lax`, `Secure`, with a
   `__Host-` prefix as the target. The SSO state cookie on `Path=/auth` can
   only take `__Secure-`. `Domain=` is never set.
5. **Sign-in return-host allowlist** is exact registry origins only. The
   `.barrels.gd` suffix rule is dropped. The app is passed explicitly, never
   guessed from the hostname label.
6. **When a new host is justified.** Only when a product has a distinct
   audience, auth/session model, branding or deployment; otherwise it is a
   module or path inside an existing product. Likely clusters: Commerce
   (shop/shopkeeping, salesbus, homegrown), Mobility (bus, taxi, delivery,
   park; the `transport` and `stores` API domains already exist), Education,
   Automotive. Reserving a name costs nothing; building an app is gated on
   validated demand. All stay on `barrels.gd`: no per-sector domains.
   **Salesbus is not reused as a host:** `salesbus` is retired; the POS keeps
   port 3030 and the reserved name and gets its host (or becomes a `shop`
   module) when built.
7. **Retired hosts are never reassigned:** `gmsadmin` (after the cutover),
   `gaa-admin`, `wxwatch`, `wxproducts`, `salesbus`, `sales`, `hurricane`,
   `spice`, `proxy`, `grenmet`. The earlier retirement of `gms` is lifted by
   this decision: `gms` becomes the Met office staff portal host.
8. **Second registrable domain** is required before any of: uploads served
   from a Barrels hostname; tenants authoring HTML, themes or scripts; a
   client gaining DNS or deploy control of `<client>.barrels.gd`; a
   site-builder product. It must be a Barrels-owned domain, not `eugine.me`,
   which hosts the owner's public site. Until then: cheap guardrails (the
   rules above, no tenant-authored script, uploads not served from Barrels hosts).
9. **Reserved names.** The platform list in `docs/ports.md` (identity/access,
   environments, ops, mail, files/static, help/legal, money, machine
   endpoints, plus every product and client host and a list of generic words)
   cannot be claimed as an organisation slug or a host label. A name is claimed
   in the same change as its port and host.
10. **Ports.** 3000-3019 stay frozen (3008 shop, 3011 never used and never
   assigned, 3016 hr, 3017 business, 3018 app, 3019 spare). Ranges by
   category: 3020-3029 platform surfaces; 3030-3059 Barrels products;
   3060-3089 client-dedicated apps; 3090-3099 dev tools; 4000-4099 retired
   Hono, never reuse; 8000-8019 Barrels Python services; 8020-8079 free;
   8080-8099 ops tools. Infrastructure and vendored ports stay as listed;
   wis2box 8001 (and SURFACE 8081) are recorded as vendored exceptions inside
   Barrels ranges. Ports are never renumbered or reused; retired ports stay in
   the table as retired. The exact assignments live in `docs/ports.md`.
11. **Enforcement.** `scripts/ci/check-ports.mjs` parses the ranges and retired
    rows, checks overlap with the vendored and infrastructure tables, and
    checks that compose `Host()` rules and the `docs/ports.md` domain table
    agree.

### Phasing

- **P0 (this change):** ADR, `docs/ports.md`, doc fixes, checker. No runtime change.
- **Later phases (separate changes, not authorised here):** finish the
  admin/gms hostname cutover; drop the suffix rule from
  `AUTH_ALLOWED_RETURN_HOSTS` and pass the app explicitly; `__Host-` cookie
  names; organisation-slug validation against the reserved list in the API;
  the `hr` app and `hr.barrels.gd/<orgSlug>` routes.

## Consequences

- Easier: one rule for naming a host or port; a collision, a reuse or an
  unrecorded host fails CI instead of surfacing in review.
- Easier: tenants cost no DNS or certificate work; adding an organisation is data.
- Harder: tenant-specific branding lives at path level until a custom domain is
  justified; the reserved list shrinks the slug namespace for organisations.
- Harder: the return-host change breaks any sign-in flow that relied on the
  suffix rule; each app must be listed explicitly when that phase lands.
- Forbidden: renumbering or reusing a port or a retired host; three-level
  hostnames; setting `Domain=` on a cookie; serving uploads or tenant-authored
  content from a `barrels.gd` host before the second domain exists.
- Open: the Cloudflare Access setup for production ops hosts and the choice of
  the second domain are not made here.
