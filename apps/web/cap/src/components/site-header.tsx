import { Logo } from "@barrelsgd/gms/components/logo";
import Link from "next/link";

const NAV = [
  { href: "/", label: "Active alerts" },
  { href: "/map", label: "Map" },
  { href: "/history", label: "History" },
  { href: "/feeds", label: "Feeds" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-gm-border border-b bg-gm-surface-page print:hidden">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link
          className="flex items-center gap-3 text-gm-heading"
          href="/"
          prefetch={false}
        >
          <Logo
            alt="Grenada Meteorological Service"
            className="h-9 w-auto"
            variant="monogram"
          />
          <span className="font-semibold text-body-base leading-tight">
            Grenada weather alerts
          </span>
        </Link>
        <nav aria-label="Main">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  className="font-medium text-gm-blue-ink underline-offset-4 hover:underline"
                  href={item.href}
                  prefetch={false}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
