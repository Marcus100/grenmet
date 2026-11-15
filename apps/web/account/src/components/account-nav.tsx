import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";

interface AccountNavProps {
  current: "profile" | "bookings";
}

/** The account's sections. The current one is marked with `aria-current`. */
export function AccountNav({ current }: AccountNavProps) {
  return (
    <nav aria-label="Account" className="flex flex-wrap gap-4 text-sm">
      <Link
        aria-current={current === "profile" ? "page" : undefined}
        className={cn(
          "font-medium underline-offset-4 hover:underline",
          current === "profile" && "underline"
        )}
        href="/"
      >
        Profile
      </Link>
      <Link
        aria-current={current === "bookings" ? "page" : undefined}
        className={cn(
          "font-medium underline-offset-4 hover:underline",
          current === "bookings" && "underline"
        )}
        href="/bookings"
      >
        My bookings
      </Link>
    </nav>
  );
}
