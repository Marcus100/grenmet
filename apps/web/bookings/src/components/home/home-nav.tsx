import Link from "next/link";
import type { ReactNode } from "react";
import { AccountControl } from "@/components/account-control";

// Real destinations only. "My bookings" and "Account" live in the account app,
// whose address this app has no typed setting for, so they are not linked yet.
// Icons only, each link named by `aria-label`.
const ICONS = {
  home: <path d="M12 3l9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9z" />,
  types: (
    <>
      <rect height="8" rx="2" width="8" x="3" y="3" />
      <rect height="8" rx="2" width="8" x="13" y="3" />
      <rect height="8" rx="2" width="8" x="3" y="13" />
      <rect height="8" rx="2" width="8" x="13" y="13" />
    </>
  ),
  studio: (
    <path
      d="M4 9l1.5-5h13L20 9M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M4 9h16M9 20v-6h6v6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    />
  ),
};

const TYPES_LABEL = "Types of business";

const ITEMS = [
  {
    label: "Home",
    icon: ICONS.home,
    href: { pathname: "/" as const },
    current: true,
  },
  {
    label: TYPES_LABEL,
    icon: ICONS.types,
    href: { pathname: "/" as const, hash: "types" },
    current: false,
  },
  {
    label: "For businesses",
    icon: ICONS.studio,
    href: { pathname: "/studio" as const },
    current: false,
  },
];

interface NavProps {
  /** False when the page has no "Types of business" block to jump to. */
  showTypes?: boolean;
}

function navItems(showTypes: boolean) {
  return showTypes ? ITEMS : ITEMS.filter((item) => item.label !== TYPES_LABEL);
}

// No display utility here: `hidden` and `inline-flex` in one string both apply and
// the later one in the stylesheet wins, which showed the laptop mark on phones.
const ITEM_BASE =
  "press items-center justify-center rounded-full focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";
const ITEM = `${ITEM_BASE} inline-flex`;

function Icon({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <svg
      aria-hidden="true"
      className="size-6"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

/** Floating left rail on laptops: the home mark, the icons and the account control. */
export function SideRail({ showTypes = true }: Readonly<NavProps>) {
  const items = navItems(showTypes);
  return (
    <>
      <Link
        aria-label="Barrels Bookings home"
        className={`${ITEM_BASE} bg-primary text-primary-foreground fixed top-5 left-5 z-30 hidden size-14 rounded-[18px] text-2xl font-extrabold shadow-lg md:inline-flex`}
        href={{ pathname: "/" }}
      >
        B
      </Link>
      <nav
        aria-label="Main"
        className="bg-background fixed top-1/2 left-5 z-30 hidden -translate-y-1/2 flex-col items-center gap-1.5 rounded-full p-1.5 shadow-lg md:flex"
      >
        {items.map((item) => (
          <Link
            aria-current={item.current ? "page" : undefined}
            aria-label={item.label}
            className={`${ITEM} size-12 ${item.current ? "bg-foreground/10 text-foreground" : "text-muted-foreground"}`}
            href={item.href}
            key={item.label}
          >
            <Icon>{item.icon}</Icon>
          </Link>
        ))}
      </nav>
      <AccountControl className="bg-background text-secondary-foreground fixed bottom-5 left-5 z-30 hidden h-14 w-14 text-center text-xs leading-tight font-semibold shadow-lg md:inline-flex" />
    </>
  );
}

/** Floating pill bar at the bottom on phones. */
export function BottomNav({ showTypes = true }: Readonly<NavProps>) {
  const items = navItems(showTypes);
  return (
    <nav
      aria-label="Quick links"
      className="bg-background fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex items-center justify-between rounded-full p-2 shadow-lg md:hidden"
    >
      {items.map((item) => (
        <Link
          aria-current={item.current ? "page" : undefined}
          aria-label={item.label}
          className={`${ITEM} h-12 w-16 ${item.current ? "bg-foreground/10 text-foreground" : "text-muted-foreground"}`}
          href={item.href}
          key={item.label}
        >
          <Icon>{item.icon}</Icon>
        </Link>
      ))}
      <AccountControl
        className={`${ITEM} text-secondary-foreground h-12 text-[13px] font-semibold`}
      />
    </nav>
  );
}
