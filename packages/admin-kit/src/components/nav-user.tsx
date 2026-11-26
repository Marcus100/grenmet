"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@barrelsgd/ui/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barrelsgd/ui/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@barrelsgd/ui/components/ui/sidebar";
import { getInitials } from "@barrelsgd/ui/lib/utils";
import { EllipsisVertical, LogOut } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/** The signed-in person, as the app read it from its own session. */
export interface NavUserData {
  readonly avatar?: string;
  readonly email: string;
  readonly name: string;
}

/** A link in the user menu (Profile, Account, View my page). */
export interface NavUserLink {
  readonly href: string;
  readonly icon?: ReactNode;
  readonly label: string;
}

/**
 * A sign-out choice. `action` is a URL the form POSTs to (for example
 * `/auth/logout`) or a Server Action. The kit does not sign anyone out; it
 * submits the app's own action.
 */
export interface NavUserSignOut {
  readonly action: string | ((formData: FormData) => void | Promise<void>);
  readonly label?: string;
}

export interface NavUserProps {
  readonly links?: readonly NavUserLink[];
  /** One or more sign-out choices ("Sign out", "Sign out of all apps"). */
  readonly signOut: NavUserSignOut | readonly NavUserSignOut[];
  readonly user: NavUserData;
}

function toList(
  signOut: NavUserSignOut | readonly NavUserSignOut[]
): readonly NavUserSignOut[] {
  return Array.isArray(signOut)
    ? (signOut as readonly NavUserSignOut[])
    : [signOut as NavUserSignOut];
}

function SignOutItem({ option }: { readonly option: NavUserSignOut }) {
  return (
    <form action={option.action} method="post">
      <DropdownMenuItem
        nativeButton
        onClick={(event) =>
          event.currentTarget.closest("form")?.requestSubmit()
        }
        render={<button type="button" />}
      >
        <LogOut />
        {option.label ?? "Sign out"}
      </DropdownMenuItem>
    </form>
  );
}

/** The signed-in person at the bottom of the sidebar, with a menu and sign-out. */
export function NavUser({ user, links = [], signOut }: NavUserProps) {
  const { isMobile } = useSidebar();
  const options = toList(signOut);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                aria-label={`Account menu for ${user.name}`}
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                size="lg"
              />
            }
          >
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage alt="" src={user.avatar || undefined} />
              <AvatarFallback className="rounded-lg">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {user.email}
              </span>
            </div>
            <EllipsisVertical aria-hidden="true" className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            {links.length > 0 ? (
              <>
                <DropdownMenuGroup>
                  {links.map((link) => (
                    <DropdownMenuItem
                      key={link.href}
                      render={<Link href={link.href as Route} />}
                    >
                      {link.icon}
                      {link.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {options.map((option) => (
              <SignOutItem key={option.label ?? "sign-out"} option={option} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
