import Link from "next/link";

// Real destinations only. "My bookings" and "Account" live in the account app,
// whose address this app has no typed setting for, so they are not linked yet.
const ITEMS = [
  { label: "Home", href: { pathname: "/" as const }, current: true },
  {
    label: "Search",
    href: { pathname: "/" as const, hash: "home-search" },
    current: false,
  },
  {
    label: "For businesses",
    href: { pathname: "/studio" as const },
    current: false,
  },
];

const PILL =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

/** Pill navigation in the header on laptops (Search is the box on the page). */
export function HeaderNav() {
  return (
    <nav
      aria-label="Main"
      className="bg-background hidden gap-1 rounded-full p-1 shadow-xs md:flex"
    >
      {ITEMS.filter((item) => item.label !== "Search").map((item) => (
        <Link
          aria-current={item.current ? "page" : undefined}
          className={`${PILL} ${item.current ? "bg-primary text-primary-foreground" : "text-foreground"}`}
          href={item.href}
          key={item.label}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Floating pill bar at the bottom on phones. */
export function BottomNav() {
  return (
    <nav
      aria-label="Quick links"
      className="bg-background fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex gap-1 rounded-full p-2 shadow-lg md:hidden"
    >
      {ITEMS.map((item) => (
        <Link
          aria-current={item.current ? "page" : undefined}
          className={`${PILL} min-h-12 flex-1 px-2 ${item.current ? "bg-primary/10 text-primary" : "text-foreground"}`}
          href={item.href}
          key={item.label}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
