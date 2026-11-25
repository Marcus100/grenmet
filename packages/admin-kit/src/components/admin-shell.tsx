import {
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
} from "@barrelsgd/theme/lib/layout";
import { getPreference } from "@barrelsgd/theme/lib/server-actions";
import { cookies } from "next/headers";
import { AdminShellFrame, type AdminShellSlots } from "./admin-shell-frame";

export type { AdminShellSlots } from "./admin-shell-frame";
export type { AdminBrand, AdminUserSlot } from "./admin-sidebar";

export interface AdminShellProps extends AdminShellSlots {
  /** First-load collapse mode. Default "icon". */
  readonly defaultSidebarCollapsible?: "icon" | "offcanvas";
  /**
   * First-load sidebar variant, used when the person has saved none. Default
   * "inset". Pass it; never change the theme package's defaults.
   */
  readonly defaultSidebarVariant?: "sidebar" | "inset" | "floating";
}

/**
 * The one admin layout (ADR-0068). A Server Component: it reads the saved
 * sidebar state and preferences from cookies, then renders the frame. The app
 * passes its brand, navigation (already filtered by role), the signed-in
 * person and the optional slots. The kit never fetches data or checks access.
 *
 * Mount `PreferencesStoreProvider` (and `ThemeBootScript`) from
 * `@barrelsgd/theme` above it, as the app's root layout does.
 */
export async function AdminShell({
  defaultSidebarCollapsible = "icon",
  defaultSidebarVariant = "inset",
  ...slots
}: AdminShellProps) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [variant, collapsible] = await Promise.all([
    getPreference(
      "sidebar_variant",
      SIDEBAR_VARIANT_VALUES,
      defaultSidebarVariant
    ),
    getPreference(
      "sidebar_collapsible",
      SIDEBAR_COLLAPSIBLE_VALUES,
      defaultSidebarCollapsible
    ),
  ]);

  return (
    <AdminShellFrame
      {...slots}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      variant={variant}
    />
  );
}
