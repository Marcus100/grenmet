"use client";

import { DollarSign, Handshake, Package } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const navItems: NavItem[] = [
  { href: "/salesbus/sales", label: "Sales", icon: DollarSign },
  { href: "/salesbus/inventory", label: "Inventory", icon: Package },
  { href: "/salesbus/settlements", label: "Settlements", icon: Handshake },
];

export function SideNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/salesbus/sales") {
      return (
        pathname === "/salesbus/sales" ||
        pathname.startsWith("/salesbus/sales/")
      );
    }
    if (href === "/salesbus/inventory") {
      return (
        pathname === "/salesbus/inventory" ||
        pathname.startsWith("/salesbus/inventory/")
      );
    }
    if (href === "/salesbus/settlements") {
      return (
        pathname === "/salesbus/settlements" ||
        pathname.startsWith("/salesbus/settlements/")
      );
    }
    return pathname === href;
  };

  return (
    <nav className="flex w-20 flex-col border-gray-200 border-r bg-card py-4">
      {navItems.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;

        return (
          <Link
            className={`relative mx-2 flex touch-manipulation flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-4 transition-colors ${
              active
                ? "bg-gm-blue/10 text-gm-blue"
                : "text-muted-foreground hover:bg-gray-100 hover:text-foreground"
            }
            `}
            href={item.href}
            key={item.href}
          >
            {active && (
              <span className="absolute top-1/2 left-0 h-8 w-1 -translate-y-1/2 rounded-r-full bg-gm-blue" />
            )}
            <Icon className="h-6 w-6" />
            <span className="text-center font-medium text-gm-micro leading-gm-micro">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
