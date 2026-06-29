"use client";

import { usePreferencesStore } from "@grenmet/theme/components/preferences-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@grenmet/ui/components/ui/sidebar";
import Image from "next/image";
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
              <Image
                alt="Grenada Met Service"
                className="shrink-0"
                height={28}
                src="/images/logo/logo-icon.svg"
                width={28}
              />
              <span className="font-semibold text-base group-data-[collapsible=icon]:hidden">
                Grenada Met Service
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
