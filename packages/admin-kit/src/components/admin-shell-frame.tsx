import { Separator } from "@barrelsgd/ui/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@barrelsgd/ui/components/ui/sidebar";
import {
  MAIN_CONTENT_ID,
  SkipLink,
} from "@barrelsgd/ui/components/ui/skip-link";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import { type AdminNavGroup, getTabItems } from "../lib/navigation";
import { AdminSearch, type AdminSearchProps } from "./admin-search";
import {
  type AdminBrand,
  AdminSidebar,
  type AdminUserSlot,
} from "./admin-sidebar";
import { AdminTabBar, TAB_BAR_CLEARANCE_CLASS } from "./admin-tab-bar";
import { LayoutControls, type LayoutControlsProps } from "./layout-controls";
import { ThemeSwitcher } from "./theme-switcher";

export interface AdminShellSlots {
  readonly brand: AdminBrand;
  /** The page context after the sidebar toggle, for example a breadcrumb. */
  readonly breadcrumb?: ReactNode;
  readonly children: ReactNode;
  /** Props for the layout controls popover; `false` hides it. Default: shown. */
  readonly layoutControls?: LayoutControlsProps | boolean;
  readonly navigation: readonly AdminNavGroup[];
  /** A notification bell or similar, placed before the display controls. */
  readonly notifications?: ReactNode;
  /** Search palette on (default) or off, or its extra options. */
  readonly search?:
    | Pick<AdminSearchProps, "extraEntries" | "fallbackGroup" | "placeholder">
    | boolean;
  /** Phone bottom tab bar: shown (default) when any item is flagged `tab`. */
  readonly tabBar?: boolean;
  /** Light/dark/system button on (default) or off. */
  readonly themeSwitcher?: boolean;
  readonly user: AdminUserSlot;
}

export interface AdminShellFrameProps extends AdminShellSlots {
  readonly collapsible: "icon" | "offcanvas";
  readonly defaultOpen: boolean;
  readonly variant: "sidebar" | "inset" | "floating";
}

function searchOptions(search: AdminShellSlots["search"]) {
  if (search === false) {
    return null;
  }
  return search === true || search === undefined ? {} : search;
}

function controlOptions(controls: AdminShellSlots["layoutControls"]) {
  if (controls === false) {
    return null;
  }
  return controls === true || controls === undefined ? {} : controls;
}

/**
 * LOW-LEVEL entry. Apps use `AdminShell`, which reads the saved sidebar state
 * from cookies and renders this. Render the frame directly only when every
 * value is already known (tests, previews, Storybook-style pages).
 */
export function AdminShellFrame({
  breadcrumb,
  brand,
  children,
  collapsible,
  defaultOpen,
  layoutControls,
  navigation,
  notifications,
  search,
  tabBar = true,
  themeSwitcher = true,
  user,
  variant,
}: AdminShellFrameProps) {
  const searchProps = searchOptions(search);
  const controlProps = controlOptions(layoutControls);
  const hasTabBar = tabBar && getTabItems(navigation).length > 0;

  return (
    <>
      <SkipLink />
      <SidebarProvider
        defaultOpen={defaultOpen}
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 68)",
          } as CSSProperties
        }
      >
        <AdminSidebar
          brand={brand}
          collapsible={collapsible}
          navigation={navigation}
          user={user}
          variant={variant}
        />
        <SidebarInset
          className={cn(
            "[html[data-content-layout=centered]_&>*]:mx-auto",
            "[html[data-content-layout=centered]_&>*]:w-full",
            "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
            // Data pages (WideContent) always use the full width.
            "[html[data-content-layout=centered]_&>*:has([data-content-width=wide])]:max-w-none",
            "peer-data-[variant=inset]:border",
            "[--dashboard-header-height:--spacing(12)]",
            "min-w-0 overflow-x-hidden"
          )}
        >
          <header
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 motion-reduce:transition-none",
              "[html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:backdrop-blur-md"
            )}
          >
            <div className="flex w-full items-center justify-between gap-2 px-4 lg:px-6">
              <div className="flex min-w-0 items-center gap-1 lg:gap-2">
                <SidebarTrigger className="-ml-1 pointer-coarse:size-11" />
                <Separator
                  className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
                  orientation="vertical"
                />
                {breadcrumb ? (
                  <div className="min-w-0 truncate">{breadcrumb}</div>
                ) : null}
                {searchProps ? (
                  <AdminSearch navigation={navigation} {...searchProps} />
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {notifications}
                {controlProps ? <LayoutControls {...controlProps} /> : null}
                {themeSwitcher ? <ThemeSwitcher /> : null}
              </div>
            </div>
          </header>
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 outline-none has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0",
              // Keep the last line of the page clear of the phone tab bar.
              hasTabBar && TAB_BAR_CLEARANCE_CLASS
            )}
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
          >
            {children}
          </div>
        </SidebarInset>
        {hasTabBar ? <AdminTabBar navigation={navigation} /> : null}
      </SidebarProvider>
    </>
  );
}
