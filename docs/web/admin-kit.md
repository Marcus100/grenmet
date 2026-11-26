# Admin kit (`@barrelsgd/admin-kit`)

**Status:** Active standard (ADR-0068)  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-25

The one shell and page blocks every admin dashboard uses. Layout from the GMS
staff portal; colours come from each app's own lane spec in `docs/design/`.

Every admin dashboard is built from this kit:

- Barrels admin;
- Bookings Studio;
- the Events organiser area;
- HR;
- Shop Keeper and Salesbus;
- the clinic product;
- the GMS portal (`gaa-admin`).

An app's own lane spec names its colour preset, its navigation and any extra
blocks. It never redefines the shell. Decision: ADR-0068.

## Principles

- **One layout, many colours.** Structure, spacing, type scale and behaviour are
  the kit's. Colour comes only from the app's tokens:
  - Barrels tokens for Barrels apps;
  - `@barrelsgd/gms` for GMS and GAA;
  - the kit has no palette of its own (ADR-0011).
- **Phone first for business owners.** Studio is run from a phone. Every shell
  part works at 360 px. Touch targets are at least 44 px on touch screens
  (`pointer-coarse:`) and keep the dense 32 px with a mouse.
- **Quiet and dense for staff.** Tables, written statuses and no decoration.
  Colour is never the only signal.
- **Show empty sections.** An empty section says what to do next, with a link.
  Nothing is hidden because it is empty.
- **The app decides, the kit draws.** The kit never fetches data, never checks a
  permission and never reads a session. Apps pass in the user, the navigation
  (already filtered by role) and the data.

## Shell (`AdminShell`)

| Part | Behaviour |
| --- | --- |
| Skip link | The first focusable element; jumps to `#main-content`. |
| Sidebar | Collapsible and inset, from the `@barrelsgd/ui` sidebar. Variant and collapse mode come from `@barrelsgd/theme` preferences: `inset`/`sidebar`/`floating`, `icon`/`offcanvas`. Top: the product logo and name. Middle: navigation groups. Bottom: `NavUser`. On phones it becomes a sheet. |
| Top bar | 48 px high. Contains: the sidebar toggle, the page context (optional breadcrumb slot), search (`AdminSearch`, opened with ⌘K or Ctrl K), and the optional slots for notifications, theme switcher and layout controls. It can be set to sticky. |
| Content | Padded. "Centred" caps the width at `max-w-screen-2xl`; data pages opt into full width (`WideContent`). |
| Phone tab bar | Optional, phones only. Carries up to four primary destinations and "More", which opens the sidebar sheet. Fixed to the bottom with the safe-area inset. From the Bookings Studio. |

## Navigation (`AdminNavGroup[]`)

- Groups have a label. Items have a title, a URL, a lucide icon passed as an
  element (`<House />`, so a Server Component can hand the config over), an
  optional badge (a count, "new" or "soon"), optional sub-items, and
  `activeMatch` (`"prefix"`, the default, or `"exact"`). Only the most specific
  matching link is current. An `isActive` function works only when the config
  lives in a client module.
- `activePrefixes` (plain strings) lets an item own pages it does not link to:
  Agenda stays current on `/studio/x/bookings/<id>`. A direct URL match on
  another item still wins over a listed prefix.
- Apps filter the navigation by role before passing it (`filterNavigation`),
  so the sidebar, search and tab bar never offer what the person cannot use.
- The current page gets `aria-current="page"`.
- The same config feeds the sidebar, the search palette and the phone tab bar
  (items marked `tab: true`), so the three never disagree.

## Page blocks

| Block | Use |
| --- | --- |
| `PageHeader` | One `h1`, a one-line description, and actions on the right (they wrap under the title on phones). |
| `PageSection` | A titled card section with an optional description and actions. Its empty state is built in. |
| `StatTile` | An icon chip, a large value, a label and a written status or change. Never colour alone. |
| `EmptyState` | An icon, one sentence on what is missing, and the next step as a link or button. |
| `DataTable` | TanStack Table: sortable columns, a search box, pagination, row actions and a phone-friendly card view under `sm`. Loading and empty states are built in. |
| `ConfirmAction` | Recorded or destructive actions sit behind a dialog that says what will change, with an optional reason field. The result comes back as a written notice. |
| `FormSection` | Label, description and field in a grid. Errors sit next to the field. |
| `SaveButton` | Shows its pending state ("Saving…") and never double-submits. |

## Preferences

`@barrelsgd/theme`:

- light, dark or system;
- preset;
- sidebar variant and collapse mode;
- content width;
- sticky navbar.

Apps pass their first-load defaults; they never change `PREFERENCE_DEFAULTS`.
A business owner's app may hide the layout controls and keep only light/dark.

## Accessibility

- One `h1` per page and headings in order.
- Visible focus, and the tab order follows the visual order.
- Every control has a label.
- Status is in text, not colour alone.
- Motion respects `prefers-reduced-motion`.

## Adoption checklist for an app

1. Add `@barrelsgd/admin-kit` and pass `brand` (name, href, logo),
   `navigation`, `user` and the optional slots. The colour preset comes from
   the app's CSS tokens and its `@barrelsgd/theme` defaults, not from `brand`.
   `AdminShell` is the entry; `AdminShellFrame` is the low-level frame it
   renders (tests and previews).
2. Delete the app's own shell, sidebar, nav and page-header copies.
3. Take before and after screenshots at 375 px and 1280 px, in light and dark.
4. Run the app's tests and the kit's tests.
5. Write the preset and the navigation into the app's lane spec.
