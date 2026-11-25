"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@barrelsgd/ui/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barrelsgd/ui/components/ui/dropdown-menu";
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
} from "@barrelsgd/ui/components/ui/sidebar";
import { cn } from "@barrelsgd/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type AdminNavBadge,
  type AdminNavGroup,
  type AdminNavItem,
  type AdminNavLinkItem,
  type AdminNavParentItem,
  type AdminNavSubItem,
  getActiveIds,
  hasSubItems,
} from "../lib/navigation";

interface NavMainProps {
  readonly items: readonly AdminNavGroup[];
}

interface BadgeProps {
  readonly badge?: AdminNavBadge;
  readonly label?: string;
}

function ItemBadge({ badge, label }: BadgeProps) {
  if (badge === undefined || badge === 0) {
    return null;
  }
  return (
    <SidebarMenuBadge
      className={cn(
        "rounded-sm border capitalize",
        badge === "new" &&
          "border-primary text-primary peer-hover/menu-button:text-primary peer-data-active/menu-button:text-primary",
        badge === "soon" && "border-muted-foreground text-muted-foreground"
      )}
    >
      {label ? (
        <>
          <span aria-hidden="true">{badge}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        badge
      )}
    </SidebarMenuBadge>
  );
}

function CollapsedIconFallback({ title }: { readonly title: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center rounded-xs text-[10px] font-medium outline"
    >
      {title.slice(0, 1)}
    </span>
  );
}

function linkProps(entry: { newTab?: boolean }) {
  return entry.newTab ? ({ rel: "noreferrer", target: "_blank" } as const) : {};
}

function NavLinkItem({
  active,
  item,
  showIconFallback,
}: {
  readonly active: boolean;
  readonly item: AdminNavLinkItem;
  readonly showIconFallback: boolean;
}) {
  const icon =
    item.icon ??
    (showIconFallback ? <CollapsedIconFallback title={item.title} /> : null);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-current={active ? "page" : undefined}
        aria-disabled={item.disabled}
        isActive={active}
        render={<Link href={item.url as Route} {...linkProps(item)} />}
        tooltip={item.title}
      >
        {icon}
        <span>{item.title}</span>
      </SidebarMenuButton>
      <ItemBadge badge={item.badge} label={item.badgeLabel} />
    </SidebarMenuItem>
  );
}

function NavDropdownItem({
  active,
  activeIds,
  item,
}: {
  readonly active: boolean;
  readonly activeIds: ReadonlySet<string>;
  readonly item: AdminNavParentItem;
}) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              disabled={item.disabled}
              isActive={active}
              tooltip={item.title}
            />
          }
        >
          {item.icon ?? <CollapsedIconFallback title={item.title} />}
          <span>{item.title}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-48"
          side="right"
          sideOffset={12}
        >
          <DropdownMenuGroup>
            {item.subItems.map((sub) => (
              <DropdownMenuItem
                disabled={sub.disabled}
                key={sub.id}
                render={
                  <Link
                    aria-current={activeIds.has(sub.id) ? "page" : undefined}
                    className="flex items-center gap-2"
                    href={sub.url as Route}
                    {...linkProps(sub)}
                  />
                }
              >
                {sub.icon}
                <span>{sub.title}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function NavSubLink({
  active,
  sub,
}: {
  readonly active: boolean;
  readonly sub: AdminNavSubItem;
}) {
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        aria-current={active ? "page" : undefined}
        aria-disabled={sub.disabled}
        isActive={active}
        render={<Link href={sub.url as Route} {...linkProps(sub)} />}
      >
        {sub.icon}
        <span>{sub.title}</span>
      </SidebarMenuSubButton>
      <ItemBadge badge={sub.badge} label={sub.badgeLabel} />
    </SidebarMenuSubItem>
  );
}

function NavCollapsibleItem({
  active,
  activeIds,
  item,
}: {
  readonly active: boolean;
  readonly activeIds: ReadonlySet<string>;
  readonly item: AdminNavParentItem;
}) {
  return (
    <Collapsible
      className="group/collapsible"
      defaultOpen={active}
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
            isActive={active}
            tooltip={item.title}
          />
        }
      >
        {item.icon}
        <span>{item.title}</span>
        <ChevronRight
          aria-hidden="true"
          className="ml-auto transition-transform duration-200 group-data-panel-open/menu-button:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <ItemBadge badge={item.badge} label={item.badgeLabel} />
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.subItems.map((sub) => (
            <NavSubLink active={activeIds.has(sub.id)} key={sub.id} sub={sub} />
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

function NavItem({
  activeIds,
  item,
}: {
  readonly activeIds: ReadonlySet<string>;
  readonly item: AdminNavItem;
}) {
  const { state, isMobile } = useSidebar();
  const collapsedDesktop = state === "collapsed" && !isMobile;
  const active = activeIds.has(item.id);

  if (!hasSubItems(item)) {
    return (
      <NavLinkItem
        active={active}
        item={item as AdminNavLinkItem}
        showIconFallback={collapsedDesktop}
      />
    );
  }
  if (collapsedDesktop) {
    return (
      <NavDropdownItem active={active} activeIds={activeIds} item={item} />
    );
  }
  return (
    <NavCollapsibleItem active={active} activeIds={activeIds} item={item} />
  );
}

/** The sidebar's grouped navigation, current page marked with `aria-current`. */
export function NavMain({ items }: NavMainProps) {
  const pathname = usePathname();
  const activeIds = getActiveIds(items, pathname);

  return (
    <>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label ? (
            <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavItem activeIds={activeIds} item={item} key={item.id} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
