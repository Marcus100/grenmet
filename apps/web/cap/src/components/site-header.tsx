import { Button } from "@grenmet/ui/components/ui/button";
import { FileText, Lock, MapIcon, RadioTower, Rss } from "lucide-react";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "Alerts", icon: FileText },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/integrations", label: "Feeds", icon: Rss },
  { href: "/admin", label: "Admin", icon: Lock },
];

export function SiteHeader() {
  return (
    <header className="border-gm-border border-b bg-white">
      <div className="mx-auto flex min-h-18 w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link className="flex min-w-0 items-center gap-3" href="/">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-gm-6 bg-gm-navy text-gm-text-inverse">
            <RadioTower aria-hidden="true" className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-gm-heading-sm text-gm-text-primary leading-gm-heading-sm">
              Grenada CAP
            </span>
            <span className="block truncate text-gm-body-sm text-gm-text-muted leading-gm-body-sm">
              Common Alerting Protocol
            </span>
          </span>
        </Link>
        <nav className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => (
            <Button asChild key={item.href} size="sm" variant="ghost">
              <Link href={item.href}>
                <item.icon aria-hidden="true" />
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}
