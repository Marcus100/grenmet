import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";

export const ACCOUNT_TABS = [
  { href: "/", label: "Profile" },
  { href: "/password", label: "Password" },
  { href: "/security", label: "Security" },
  { href: "/sessions", label: "Sessions" },
  { href: "/access", label: "Access" },
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number]["href"];

export function AccountTabs({ current }: { current: AccountTab }) {
  return (
    <nav
      aria-label="Account"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <div className="flex min-w-max gap-6 border-border border-b">
        {ACCOUNT_TABS.map((tab) => (
          <Link
            aria-current={tab.href === current ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 pb-3 font-medium text-sm transition",
              tab.href === current
                ? "border-(--auth-accent) text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
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
