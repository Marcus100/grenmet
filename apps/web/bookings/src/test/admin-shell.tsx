/**
 * `AdminShell` is an async Server Component (it reads cookies), which a jsdom
 * render cannot await. Tests mock it with the kit's own frame and fixed
 * values, so the real sidebar, tab bar and user menu still draw:
 *
 *   vi.mock("@barrelsgd/admin-kit/components/admin-shell", () => adminShellMock());
 *   vi.mock("@barrelsgd/theme/components/preferences-provider", () => preferencesMock());
 */
export async function adminShellMock() {
  const { AdminShellFrame } = await import(
    "@barrelsgd/admin-kit/components/admin-shell-frame"
  );
  return {
    AdminShell: (props: Parameters<typeof AdminShellFrame>[0]) => (
      <AdminShellFrame
        {...props}
        collapsible="icon"
        defaultOpen
        variant="inset"
      />
    ),
  };
}

/** The preferences the studio runs on: light, sticky top bar, centred. */
export function preferencesMock() {
  const state: Record<string, unknown> = {
    isSynced: false,
    sidebarCollapsible: "icon",
    sidebarVariant: "inset",
    themeMode: "light",
    resolvedThemeMode: "light",
    themePreset: "default",
    font: "inter",
    contentLayout: "centered",
    navbarStyle: "sticky",
  };
  return {
    PreferencesStoreProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    usePreferencesStore: (selector: (s: Record<string, unknown>) => unknown) =>
      selector(state),
  };
}
