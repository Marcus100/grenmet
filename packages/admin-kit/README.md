# @barrelsgd/admin-kit

The shared admin dashboard shell and page blocks (ADR-0068, `docs/design/admin-kit.md`). One layout for every admin; each app brings its own colours.

## Use it

1. Add `"@barrelsgd/admin-kit": "workspace:*"` to the app, and let Tailwind see the kit's classes in `globals.css`:

   ```css
   @source "../../node_modules/@barrelsgd/admin-kit/src";
   ```

2. Mount `PreferencesStoreProvider` and `ThemeBootScript` from `@barrelsgd/theme` in the root layout, as `gaa-admin` does.
3. Wrap the signed-in pages:

```tsx
// app/(admin)/layout.tsx  (Server Component)
import { AdminShell } from "@barrelsgd/admin-kit/components/admin-shell";
import type { AdminNavGroup } from "@barrelsgd/admin-kit/lib/navigation";
import { House, Users } from "lucide-react";

const navigation: AdminNavGroup[] = [
  {
    id: "main",
    items: [
      { id: "home", title: "Home", url: "/", icon: <House />, tab: true },
      { id: "people", title: "People", url: "/people", icon: <Users />, tab: true },
    ],
  },
];

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await readSession(); // the app's own session reading
  return (
    <AdminShell
      brand={{ name: "Studio", href: "/", logo: <Logo /> }}
      navigation={navigation} // filter by role first with filterNavigation()
      user={{
        user: { name: session.name, email: session.email },
        signOut: { action: "/auth/logout" },
      }}
    >
      {children}
    </AdminShell>
  );
}
```

```tsx
// a page
import { PageHeader } from "@barrelsgd/admin-kit/components/page-header";
import { DataTable } from "@barrelsgd/admin-kit/components/data-table";

<PageHeader title="People" description="Everyone on the team." />
<DataTable
  label="People"
  columns={[{ accessorKey: "name", header: "Name" }]}
  data={people}
  empty={{ title: "No people yet.", link: { href: "/people/new", label: "Add a person" } }}
/>
```

## What is in it

| Import path | Exports |
| --- | --- |
| `components/admin-shell` | `AdminShell` (server), types `AdminShellProps`, `AdminBrand`, `AdminUserSlot` |
| `components/admin-shell-frame` | `AdminShellFrame` (low-level: values given, for tests and previews only; apps use `AdminShell`) |
| `components/nav-main`, `admin-sidebar`, `admin-search`, `admin-tab-bar` | `NavMain`, `AdminSidebar`, `AdminSearch`, `AdminTabBar` |
| `components/nav-user`, `theme-switcher`, `layout-controls` | `NavUser`, `ThemeSwitcher`, `LayoutControls` |
| `components/page-header`, `page-section`, `stat-tile`, `empty-state`, `wide-content` | `PageHeader`, `PageSection`, `StatTile`, `EmptyState`, `WideContent` |
| `components/data-table` | `DataTable`, type `DataTableColumn` |
| `components/confirm-action` | `ConfirmAction`, type `ConfirmResult` |
| `components/form-section` | `FormSection`, `SaveButton` |
| `lib/navigation` | `AdminNavGroup`, `AdminNavItem`, `getActiveIds`, `getTabItems`, `getSearchEntries`, `filterNavigation`, `MAX_TAB_ITEMS` |

## Rules (read before changing the kit)

The standard is `docs/design/admin-kit.md` (ADR-0068). Layout comes from the GMS staff portal; colour comes from each app.

- The kit draws, the app decides: no API calls, no session reading, no permission checks, no `process.env`, no brand colours (semantic tokens only: no `--gm-*`, no hard-coded colours), never a GAA or Barrels mark. Apps pass `brand`, `navigation` (already filtered by role, `filterNavigation`), `user` and the optional slots.
- Pass icons as elements (`<House />`), not components, so a Server Component can hand the navigation to the shell. Functions (`isActive`) cannot cross that boundary: use `activeMatch` unless the config lives in a client module.
- Phone tab bar: flag up to four link items with `tab: true`; "More" opens the sidebar sheet.
- Needs `PreferencesStoreProvider` from `@barrelsgd/theme` above it. Apps add `@source "../../node_modules/@barrelsgd/admin-kit/src";` to `globals.css` so Tailwind sees the kit's classes.
- `DataTable` uses TanStack Table's legacy hook (`useLegacyTable`, as `gaa-admin` does) and carries `"use no memo"`.
- A kit change affects every admin: run every consumer's tests and take before and after screenshots of each (375 px and 1280 px, light and dark).
- Tests: `turbo run type-check test --filter=@barrelsgd/admin-kit`.
