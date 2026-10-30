import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";

export const ACCOUNT_TABS = [
  { href: "/", label: "Profile" },
  { href: "/password", label: "Password" },
  { href: "/security", label: "Security" },
  { href: "/sessions", label: "Sessions" },
  { href: "/apps", label: "Apps" },
  { href: "/organisations", label: "Organisations" },
  { href: "/tickets", label: "Tickets" },
  { href: "/rewards", label: "Rewards" },
  { href: "/access", label: "Access" },
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number]["href"];

export function AccountTabs({ current }: { current: AccountTab }) {
  return (
    <nav
      aria-label="Account"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <div className="border-border flex min-w-max gap-6 border-b">
        {ACCOUNT_TABS.map((tab) => (
          <Link
            aria-current={tab.href === current ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 pb-3 text-sm font-medium transition",
              tab.href === current
                ? "text-foreground border-(--auth-accent)"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
