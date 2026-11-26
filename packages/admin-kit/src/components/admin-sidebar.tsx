"use client";

import { usePreferencesStore } from "@barrelsgd/theme/components/preferences-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@barrelsgd/ui/components/ui/sidebar";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminNavGroup } from "../lib/navigation";
import { NavMain } from "./nav-main";
import type { NavUserData } from "./nav-user";
import { NavUser, type NavUserLink, type NavUserSignOut } from "./nav-user";

/** The product's name and mark. The kit has no logo of its own. */
export interface AdminBrand {
  /** The mark shown when the sidebar is collapsed to icons. Defaults to `logo`. */
  readonly collapsedLogo?: ReactNode;
  /**
   * Leave the written name out when `logo` already spells it (a wordmark). The
   * name still labels the link.
   */
  readonly hideName?: boolean;
  /** Where the logo links to: the dashboard home. */
  readonly href: string;
  readonly logo?: ReactNode;
  readonly name: string;
}

export interface AdminUserSlot {
  readonly links?: readonly NavUserLink[];
  readonly signOut: NavUserSignOut | readonly NavUserSignOut[];
  readonly user: NavUserData;
}

interface AdminSidebarProps {
  readonly brand: AdminBrand;
  readonly collapsible: "icon" | "offcanvas";
  readonly navigation: readonly AdminNavGroup[];
  readonly user: AdminUserSlot;
  readonly variant: "sidebar" | "inset" | "floating";
}

/**
 * The sidebar: product on top, navigation in the middle, the signed-in person
 * at the bottom. Variant and collapse mode follow the saved preferences once
 * they are read in the browser; until then the server-read values apply.
 */
export function AdminSidebar({
  brand,
  collapsible,
  navigation,
  user,
  variant,
}: AdminSidebarProps) {
  const sidebarVariant = usePreferencesStore((s) => s.sidebarVariant);
  const sidebarCollapsible = usePreferencesStore((s) => s.sidebarCollapsible);
  const isSynced = usePreferencesStore((s) => s.isSynced);

  return (
    <Sidebar
      collapsible={isSynced ? sidebarCollapsible : collapsible}
      variant={isSynced ? sidebarVariant : variant}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label={`${brand.name} home`}
              render={<Link href={brand.href as Route} />}
              size="lg"
            >
              {brand.collapsedLogo ? (
                <>
                  <span className="hidden items-center group-data-[collapsible=icon]:flex">
                    {brand.collapsedLogo}
                  </span>
                  <span className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                    {brand.logo}
                    {brand.hideName ? null : (
                      <span className="truncate font-semibold">
                        {brand.name}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  {brand.logo}
                  {brand.hideName ? null : (
                    <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
                      {brand.name}
                    </span>
                  )}
                </>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      {/* A thin, quiet scrollbar that stays visible, so touch and keyboard users
          still see there is more menu. */}
      <SidebarContent className="[scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
        <NavMain items={navigation} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser links={user.links} signOut={user.signOut} user={user.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
