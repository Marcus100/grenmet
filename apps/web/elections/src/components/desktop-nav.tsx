"use client";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@barrelsgd/ui/components/ui/navigation-menu";
import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent, isGroup, NAV } from "@/lib/nav";

const TRIGGER =
  "h-16 rounded-none px-2 text-base font-medium text-el-ink-2 xl:px-2";
const ACTIVE = "text-el-ink shadow-[inset_0_-2px_0_var(--el-ink)]";

/** The bar when the masthead has 80rem of room; smaller screens get the hamburger instead. */
export function DesktopNav() {
  const pathname = usePathname();

  return (
    <NavigationMenu aria-label="Main" className="@min-7xl/masthead:flex hidden">
      <NavigationMenuList>
        {NAV.map((item) => {
          if (!isGroup(item)) {
            const current = isCurrent(item.href, pathname);
            return (
              <NavigationMenuItem key={item.href}>
                <NavigationMenuLink
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    TRIGGER,
                    "flex items-center hover:bg-transparent hover:text-el-ink",
                    current && ACTIVE
                  )}
                  render={<Link href={item.href} />}
                >
                  {item.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          }
          const active = item.links.some((link) =>
            isCurrent(link.href, pathname)
          );
          return (
            <NavigationMenuItem key={item.label}>
              <NavigationMenuTrigger className={cn(TRIGGER, active && ACTIVE)}>
                {item.label}
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-64 gap-0.5 p-1">
                  {item.links.map((link) => (
                    <li key={link.href}>
                      <NavigationMenuLink
                        aria-current={
                          isCurrent(link.href, pathname) ? "page" : undefined
                        }
                        className="py-3 text-base aria-[current=page]:font-semibold"
                        render={<Link href={link.href} />}
                      >
                        {link.label}
                      </NavigationMenuLink>
                    </li>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
