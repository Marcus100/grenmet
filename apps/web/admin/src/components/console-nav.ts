import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Building2,
  Clock,
  CreditCard,
  FileText,
  Flag,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";

export interface ConsoleNavItem {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: string;
}

export interface ConsoleNavGroup {
  readonly items: readonly ConsoleNavItem[];
  readonly label: string;
}

/** Console navigation, grouped like the GMS portal sidebar. */
export const CONSOLE_NAV: readonly ConsoleNavGroup[] = [
  {
    label: "Platform",
    items: [
      { href: "/", icon: LayoutDashboard, title: "Overview" },
      { href: "/organisations", icon: Building2, title: "Organisations" },
      { href: "/moderation", icon: BadgeCheck, title: "Moderation" },
      { href: "/bookings/listings", icon: Store, title: "Bookings listings" },
      { href: "/audit", icon: ScrollText, title: "Audit" },
    ],
  },
  {
    label: "Billing",
    items: [
      { href: "/invoices", icon: FileText, title: "Invoices" },
      { href: "/receivables", icon: Clock, title: "Receivables" },
      { href: "/customers", icon: Users, title: "Customers" },
      { href: "/payments", icon: CreditCard, title: "Payments" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/flags", icon: Flag, title: "Feature flags" },
      { href: "/superusers", icon: ShieldCheck, title: "Superusers" },
    ],
  },
];

/** Overview matches only itself; every other item also owns its sub-pages. */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
