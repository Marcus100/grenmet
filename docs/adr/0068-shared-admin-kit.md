# ADR-0068: One shared admin kit for every admin dashboard

## Status

Accepted 25 November 2026 by the owner. The owner said: "I want to use GMS
admin for all admin dashboards", standardised on the template it came from. The
same day the owner chose:

- the same layout everywhere, with each product's own colours;
- a new `@barrelsgd/admin-kit` package.

Package built (#1908); no app migrated.

## Context

The GMS staff portal (`apps/web/gaa-admin`) was rebuilt in November 2026 on
the "Studio Admin" template. That is
[arhamkhnz/next-shadcn-admin-dashboard-baseui](https://github.com/arhamkhnz/next-shadcn-admin-dashboard-baseui),
MIT licensed: Next.js 16, Tailwind v4, shadcn on Base UI, Zustand preferences
and TanStack Table. Its display preferences were then moved into
`@barrelsgd/theme`: light and dark, presets, sidebar variant and collapse, and
content width.

Three admin shells now exist, each written by hand:

| App | Shell | Size | Notes |
| --- | --- | --- | --- |
| GMS portal (`gaa-admin`) | `components/layout/*`: app shell, sidebar, nav, user menu, search, layout controls, theme switcher, page header | about 1,350 lines (excluding tests) | Tied to GMS: logo, CAP desk links, notification bell |
| Barrels admin (`admin`) | `components/console-sidebar.tsx` | 164 lines | A copy of the GMS layout from shared primitives (`docs/design/admin.md`) |
| Bookings Studio (`bookings` `/studio`) | `components/studio/studio-shell.tsx`, `studio-nav.tsx`, `studio-ui.tsx` | about 490 lines | Like the GMS portal, plus a phone bottom tab bar (#1818) |

More admins are coming:

- the Events organiser area;
- HR (`hr.barrels.gd`);
- Shop Keeper and Salesbus;
- the clinic product.

Every new admin today starts with another copy, and the copies already differ:
navigation shape, page header, empty states and the phone layout.

## Evidence

- **Facts:**
  - The three shells and their sizes are in the table above (`git ls-tree`, 25 Nov 2026).
  - `@barrelsgd/theme` is used by `gaa-admin` and `gms` only.
  - `@tanstack/react-table` is already in the pnpm catalog.
  - ADR-0011 makes shared UI brand-neutral, with brands supplied as tokens.
- **Assumptions:**
  - The GMS portal layout suits small-business owners on phones once the
    Studio's bottom tab bar is added.
  - The owner runs Studio on a phone first (`docs/design/bookings.md`).
- **Unknowns:**
  - How much of `gaa-admin`'s shell depends on GMS-only behaviour beyond the
    logo, CAP desk navigation and notifications.
  - The migration measures this before `gaa-admin` moves.

## Options

1. **Keep copying the GMS shell into each app.**
   - Cheapest per app.
   - Drift grows with every app.
   - Fixes and accessibility work must be repeated.
2. **Put the shell in `@barrelsgd/ui`.**
   - No new package.
   - Mixes app-shell code (Next routing, preferences, session user) into the
     brand-neutral component library that every public site also uses.
3. **A new `@barrelsgd/admin-kit` package on top of `@barrelsgd/ui` and
   `@barrelsgd/theme`.**
   - Holds the shell and admin page blocks; apps pass in their name, logo,
     navigation and colour preset.
   - One more package, with its own `package.json` and `tsconfig`.

## Decision

Option 3.

1. **One layout for every admin:** the GMS portal shell. Admins include Barrels
   admin, Bookings Studio, the Events organiser area, HR, Shop Keeper, Salesbus,
   the clinic product, and `gaa-admin` itself. The shell provides:
   - a collapsible inset sidebar with grouped navigation, the product name and
     logo, and the signed-in person with Sign out;
   - a slim top bar with the sidebar toggle, search (command palette fed by the
     navigation config), optional notifications, the theme switcher and layout
     controls;
   - a padded content area, centred or full width;
   - **on phones**, the sidebar becomes a sheet and an optional bottom tab bar
     carries up to four primary destinations (from the Bookings Studio).
2. **Same layout, own colours.** The kit carries no brand (ADR-0011):
   - GMS and GAA apps pass the Met Service palette (`@barrelsgd/gms`, `--gm-*`);
   - Barrels apps pass Barrels tokens;
   - a business may add its accent where its own customers see it.

   GAA's marks never appear on Barrels products, and the reverse.
3. **`@barrelsgd/admin-kit`** (`packages/admin-kit`) exports:
   - `AdminShell` with slots;
   - navigation types (`AdminNavGroup`, items with an icon element, a badge,
     a `requires` hint and `activeMatch`) and `filterNavigation`;
   - `NavUser`, `AdminSearch`;
   - page blocks: `PageHeader`, `PageSection`, `StatTile`, `EmptyState`,
     `DataTable` (TanStack Table), `ConfirmAction`, `FormSection`, `SaveButton`;
   - a phone bottom tab bar.

   It depends on `@barrelsgd/ui` (primitives) and `@barrelsgd/theme`
   (preferences). Apps keep their own session reading, permissions and data.
   The kit never calls the API and never decides access.
4. **Migration order:**
   1. Bookings Studio first (the current focus).
   2. Barrels admin.
   3. `gaa-admin` last, with before and after screenshots showing no visible
      change (run `gaa-admin-change` first).

   Each move is its own pull request.
5. **The standard is `docs/web/admin-kit.md`.** A lane spec for an admin app
   names its preset, navigation and any extra blocks, and does not redefine the
   shell.

## Consequences

- **Easier:**
  - a new admin starts with a finished shell;
  - accessibility, phone and dark-mode fixes land once;
  - staff learn one admin.
- **Harder:**
  - a change to the kit affects every admin, so kit pull requests run every
    consumer's tests and take before and after screenshots of each;
  - the kit's API must stay small and slot-based.
- **Forbidden:**
  - copying the shell into an app again;
  - brand colours inside the kit;
  - the kit fetching data or checking permissions.
- **Template upstream:** the template changes often and may break. We copy
  ideas and fixes from it by hand. It is not a dependency.
