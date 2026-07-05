"use client";

import { usePreferencesStore } from "@grenmet/theme/components/preferences-provider";
import { Logo } from "@grenmet/ui/components/ui/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@grenmet/ui/components/ui/sidebar";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";
import { sidebarItems } from "@/navigation/sidebar-items";
import { NavMain } from "./nav-main";
import { NavUser, type NavUserData } from "./nav-user";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  readonly user: NavUserData;
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    }))
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar {...props} collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/" prefetch={false} />}
              size="lg"
            >
              <span className="hidden items-center group-data-[collapsible=icon]:flex">
                <Logo className="size-7 shrink-0" variant="icon" />
              </span>
              <span className="flex items-center group-data-[collapsible=icon]:hidden">
                <Logo className="h-7 w-auto" priority variant="primary" />
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
