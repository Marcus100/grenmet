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
| `components/admin-shell-frame` | `AdminShellFrame` (values given, for tests and previews) |
| `components/nav-main`, `admin-sidebar`, `admin-search`, `admin-tab-bar` | `NavMain`, `AdminSidebar`, `AdminSearch`, `AdminTabBar` |
| `components/nav-user`, `theme-switcher`, `layout-controls` | `NavUser`, `ThemeSwitcher`, `LayoutControls` |
| `components/page-header`, `page-section`, `stat-tile`, `empty-state`, `wide-content` | `PageHeader`, `PageSection`, `StatTile`, `EmptyState`, `WideContent` |
| `components/data-table` | `DataTable`, type `DataTableColumn` |
| `components/confirm-action` | `ConfirmAction`, type `ConfirmResult` |
| `components/form-section` | `FormSection`, `SaveButton` |
| `lib/navigation` | `AdminNavGroup`, `AdminNavItem`, `getActiveIds`, `getTabItems`, `getSearchEntries`, `filterNavigation`, `MAX_TAB_ITEMS` |

## Rules

- No brand colours, no API calls, no session reading, no permission checks. The app passes everything in.
- Pass icons as elements (`<House />`).
- Phone tab bar: flag up to four link items with `tab: true`; "More" opens the sidebar sheet.
