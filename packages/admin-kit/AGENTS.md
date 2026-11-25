# @barrelsgd/admin-kit — agent context

The one shell and page blocks every admin dashboard uses (ADR-0068). The standard is `docs/design/admin-kit.md`; read it before changing anything here. Layout comes from the GMS staff portal (`apps/web/gaa-admin`, "Studio Admin" template); colour comes from each app.

- `src/components/`: `admin-shell.tsx` (`AdminShell`, async Server Component: reads the `sidebar_state` cookie and the sidebar preferences, renders `AdminShellFrame`), `admin-shell-frame.tsx` (the frame, slots in props), `admin-sidebar.tsx`, `nav-main.tsx`, `nav-user.tsx`, `admin-search.tsx` (⌘K), `admin-tab-bar.tsx` (phone), `theme-switcher.tsx`, `layout-controls.tsx`, and the page blocks `page-header`, `page-section`, `stat-tile`, `empty-state`, `data-table`, `confirm-action`, `form-section`, `wide-content`.
- `src/lib/navigation.ts`: the navigation types and pure helpers (`getActiveIds`, `getTabItems`, `getSearchEntries`, `filterNavigation`). One config feeds the sidebar, the search palette and the tab bar.
- Boundary: the kit draws, the app decides. No API calls, no session reading, no permission checks, no `process.env`, no brand colours (semantic tokens only: no `--gm-*`, no hard-coded colours), never a GAA or Barrels mark. Apps pass `brand`, `navigation` (already filtered by role), `user` and the optional slots.
- Icons are elements (`<House />`), not components, so a Server Component can hand the navigation to the shell. Functions (`isActive`) cannot cross that boundary: use `activeMatch` unless the config lives in a client module.
- Needs `PreferencesStoreProvider` from `@barrelsgd/theme` above it. Apps add `@source "../../node_modules/@barrelsgd/admin-kit/src";` to `globals.css` so Tailwind sees the kit's classes.
- `DataTable` uses TanStack Table's legacy hook (`useLegacyTable`, as `gaa-admin` does) and carries `"use no memo"`.
- A kit change affects every admin: run every consumer's tests and take before and after screenshots of each (375 px and 1280 px, light and dark).
- Tests: `turbo run type-check test --filter=@barrelsgd/admin-kit`.
