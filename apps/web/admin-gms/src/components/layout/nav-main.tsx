"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@grenmet/ui/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@grenmet/ui/components/ui/sidebar";
import { cn } from "@grenmet/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type {
  NavBadge,
  NavGroup,
  NavMainItem,
  NavMainLinkItem,
  NavMainParentItem,
} from "@/navigation/sidebar-items";

interface NavMainProps {
  readonly items: readonly NavGroup[];
}

interface NavItemProps {
  readonly isItemActive: (item: NavMainItem) => boolean;
  readonly isSubItemActive: (url: string) => boolean;
  readonly isSubmenuOpen: (item: NavMainParentItem) => boolean;
  readonly item: NavMainItem;
}

interface NavLinkItemProps {
  readonly isActive: boolean;
  readonly item: NavMainLinkItem;
  readonly showIconFallback: boolean;
}

interface NavLinkIconProps {
  readonly item: NavMainLinkItem;
  readonly showFallback: boolean;
}

interface NavDropdownItemProps {
  readonly isActive: boolean;
  readonly isSubItemActive: (url: string) => boolean;
  readonly item: NavMainParentItem;
}

interface NavCollapsibleItemProps {
  readonly defaultOpen: boolean;
  readonly isActive: boolean;
  readonly isSubItemActive: (url: string) => boolean;
  readonly item: NavMainParentItem;
}

function CollapsedIconFallback({ title }: { title: string }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-xs font-medium text-[10px] outline">
      {title.slice(0, 1)}
    </span>
  );
}

function hasSubItems(item: NavMainItem): item is NavMainParentItem {
  return Boolean(item.subItems?.length);
}

export function NavMain({ items }: NavMainProps) {
  const path = usePathname();

  const isItemActive = (item: NavMainItem) => {
    if (hasSubItems(item)) {
      return item.subItems.some((sub) => path.startsWith(sub.url));
    }

    return path === item.url;
  };

  const isSubItemActive = (url: string) => path === url;

  const isSubmenuOpen = (item: NavMainParentItem) =>
    item.subItems.some((sub) => path.startsWith(sub.url));

  return (
    <>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && (
            <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
              {group.label}
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavItem
                  isItemActive={isItemActive}
                  isSubItemActive={isSubItemActive}
                  isSubmenuOpen={isSubmenuOpen}
                  item={item}
                  key={item.id}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function NavItem({
  item,
  isItemActive,
  isSubItemActive,
  isSubmenuOpen,
}: NavItemProps) {
  const { state, isMobile } = useSidebar();
  const isCollapsedDesktop = state === "collapsed" && !isMobile;

  if (!hasSubItems(item)) {
    return (
      <NavLinkItem
        isActive={isItemActive(item)}
        item={item}
        showIconFallback={isCollapsedDesktop}
      />
    );
  }

  if (isCollapsedDesktop) {
    return (
      <NavDropdownItem
        isActive={isItemActive(item)}
        isSubItemActive={isSubItemActive}
        item={item}
      />
    );
  }

  return (
    <NavCollapsibleItem
      defaultOpen={isSubmenuOpen(item)}
      isActive={isItemActive(item)}
      isSubItemActive={isSubItemActive}
      item={item}
    />
  );
}

function NavLinkItem({ item, isActive, showIconFallback }: NavLinkItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-disabled={item.disabled}
        isActive={isActive}
        render={
          <Link
            href={item.url}
            prefetch={false}
            rel={item.newTab ? "noreferrer" : undefined}
            target={item.newTab ? "_blank" : undefined}
          />
        }
        tooltip={item.title}
      >
        <NavLinkIcon item={item} showFallback={showIconFallback} />
        <span>{item.title}</span>
      </SidebarMenuButton>
      <NavItemBadge badge={item.badge} />
    </SidebarMenuItem>
  );
}

function NavLinkIcon({ item, showFallback }: NavLinkIconProps) {
  const Icon = item.icon;

  if (Icon) {
    return <Icon />;
  }

  if (showFallback) {
    return <CollapsedIconFallback title={item.title} />;
  }

  return null;
}

function NavDropdownItem({
  item,
  isActive,
  isSubItemActive,
}: NavDropdownItemProps) {
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              disabled={item.disabled}
              isActive={isActive}
              tooltip={item.title}
            />
          }
        >
          {Icon ? <Icon /> : <CollapsedIconFallback title={item.title} />}
          <span>{item.title}</span>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="w-48"
          side="right"
          sideOffset={12}
        >
          <DropdownMenuGroup>
            {item.subItems.map((subItem) => {
              const SubIcon = subItem.icon;

              return (
                <DropdownMenuItem
                  disabled={subItem.disabled}
                  key={subItem.id}
                  render={
                    <Link
                      aria-current={
                        isSubItemActive(subItem.url) ? "page" : undefined
                      }
                      className="flex items-center gap-2"
                      href={subItem.url}
                      prefetch={false}
                      rel={subItem.newTab ? "noreferrer" : undefined}
                      target={subItem.newTab ? "_blank" : undefined}
                    />
                  }
                >
                  {SubIcon && <SubIcon />}
                  <span>{subItem.title}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function NavCollapsibleItem({
  item,
  isActive,
  defaultOpen,
  isSubItemActive,
}: NavCollapsibleItemProps) {
  const Icon = item.icon;

  return (
    <Collapsible
      className="group/collapsible"
      defaultOpen={defaultOpen}
      render={
        <li
          className="group/menu-item relative"
          data-sidebar="menu-item"
          data-slot="sidebar-menu-item"
        />
      }
    >
      <CollapsibleTrigger
        render={
          <SidebarMenuButton
            disabled={item.disabled}
            isActive={isActive}
            tooltip={item.title}
          />
        }
      >
        {Icon && <Icon />}
        <span>{item.title}</span>
        <ChevronRight className="ml-auto transition-transform duration-200 group-data-panel-open/menu-button:rotate-90" />
      </CollapsibleTrigger>
      <NavItemBadge badge={item.badge} />

      <CollapsibleContent>
        <SidebarMenuSub>
          {item.subItems.map((subItem) => {
            const SubIcon = subItem.icon;

            return (
              <SidebarMenuSubItem key={subItem.id}>
                <SidebarMenuSubButton
                  aria-disabled={subItem.disabled}
                  isActive={isSubItemActive(subItem.url)}
                  render={
                    <Link
                      href={subItem.url}
                      prefetch={false}
                      rel={subItem.newTab ? "noreferrer" : undefined}
                      target={subItem.newTab ? "_blank" : undefined}
                    />
                  }
                >
                  {SubIcon && <SubIcon />}
                  <span>{subItem.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

function NavItemBadge({ badge }: { badge?: NavBadge }) {
  if (!badge) {
    return null;
  }

  return (
    <SidebarMenuBadge
      className={cn(
        "rounded-sm border capitalize",
        badge === "new" &&
          "border-green-600 text-green-600 peer-hover/menu-button:text-green-600 peer-data-active/menu-button:text-green-600",
        badge === "soon" && "border-muted-foreground text-muted-foreground"
      )}
    >
      {badge}
    </SidebarMenuBadge>
  );
}
