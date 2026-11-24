import Link from "next/link";

// Real destinations only. "My bookings" and "Account" live in the account app,
// whose address this app has no typed setting for, so they are not linked yet.
const ICONS = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  studio: (
    <>
      <rect height="15" rx="3" width="16" x="4" y="5" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
};

const ITEMS = [
  {
    label: "Home",
    phone: "Home",
    icon: ICONS.home,
    href: { pathname: "/" as const },
    current: true,
  },
  {
    label: "Search",
    phone: "Search",
    icon: ICONS.search,
    href: { pathname: "/" as const, hash: "home-search" },
    current: false,
  },
  {
    label: "For businesses",
    phone: "Studio",
    icon: ICONS.studio,
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
          className={`${PILL} min-h-12 flex-1 flex-col gap-0.5 px-2 text-xs ${item.current ? "bg-primary/10 text-primary" : "text-foreground"}`}
          href={item.href}
          key={item.label}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="22"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="22"
          >
            {item.icon}
          </svg>
          {item.phone}
        </Link>
      ))}
    </nav>
  );
}
