import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";

interface AccountNavProps {
  current: "profile" | "bookings";
}

const NAV_LINK =
  "inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline";

/**
 * The account's sections. The current one is marked with `aria-current`. Each
 * link is at least 44 px tall: a 20 px text link is hard to hit on a phone.
 */
export function AccountNav({ current }: AccountNavProps) {
  return (
    <nav aria-label="Account" className="flex flex-wrap gap-x-4 text-sm">
      <Link
        aria-current={current === "profile" ? "page" : undefined}
        className={cn(NAV_LINK, current === "profile" && "underline")}
        href="/"
      >
        Profile
      </Link>
      <Link
        aria-current={current === "bookings" ? "page" : undefined}
        className={cn(NAV_LINK, current === "bookings" && "underline")}
        href="/bookings"
      >
        My bookings
      </Link>
    </nav>
  );
}
