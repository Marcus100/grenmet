"use client";

import { DollarSign, Handshake, Package } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { href: "/sales", label: "Sales", icon: DollarSign },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/settlements", label: "Settlements", icon: Handshake },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/sales") {
      return pathname === "/sales" || pathname.startsWith("/sales/");
    }
    if (href === "/inventory") {
      return pathname === "/inventory" || pathname.startsWith("/inventory/");
    }
    if (href === "/settlements") {
      return (
        pathname === "/settlements" || pathname.startsWith("/settlements/")
      );
    }
    return pathname === href;
  };

  return (
    <nav className="safe-area-bottom fixed right-0 bottom-0 left-0 border-gray-200 border-t bg-[var(--color-surface)]">
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-around sm:h-18">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              className={`relative flex h-full min-w-[72px] touch-manipulation flex-col items-center justify-center gap-1 px-4 transition-colors sm:px-6 ${
                active
                  ? "text-[var(--color-primary)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] active:bg-gray-100"
              }
              `}
              href={item.href}
              key={item.href}
            >
              {active && (
                <span className="absolute top-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-[var(--color-primary)]" />
              )}
              <Icon className="h-6 w-6" />
              <span className="font-medium text-xs sm:text-sm">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
