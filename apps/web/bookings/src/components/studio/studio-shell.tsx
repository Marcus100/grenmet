import { AdminShell } from "@barrelsgd/admin-kit/components/admin-shell";
import { cn } from "@barrelsgd/ui/lib/utils";
import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { StudioSkipLink } from "@/components/root-skip-link";
import { FOCUS } from "@/components/studio/studio-ui";
import { studioNavigation } from "@/lib/studio-navigation";

export interface StudioShellProps {
  /** Owners and admins: New booking and Plan & billing. */
  canManage: boolean;
  children: React.ReactNode;
  /** The business's name; a generic name stands in when it could not be read. */
  name: string;
  orgSlug: string;
  pendingCount: number | null;
  /** The customers' booking page (`/<public slug>`), when the business has one. */
  publicHref: string | null;
  /** The signed-in person. */
  user: { email: string; name: string };
}

/** The Barrels Bookings mark: a navy "B", the same in every business's studio. */
function BookingsMark() {
  return (
    <span
      aria-hidden="true"
      className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-base font-bold"
    >
      B
    </span>
  );
}

/**
 * The mark and the business's name. The kit truncates a brand name to one line;
 * a business name can be long, so it wraps to two lines here and the full name
 * stays in the tooltip and the link's label.
 */
function BusinessBrand({ name }: Readonly<{ name: string }>) {
  return (
    <span className="flex min-w-0 items-center gap-2" title={name}>
      <BookingsMark />
      <span className="line-clamp-2 min-w-0 text-sm leading-tight font-semibold break-words whitespace-normal">
        {name}
      </span>
    </span>
  );
}

/**
 * The studio frame: the shared admin shell (`@barrelsgd/admin-kit`, ADR-0068)
 * with the business as the brand, one navigation config filtered by role, the
 * waiting count on Agenda, New booking in the top bar for owners and admins,
 * and the phone tab bar. Light only: the studio's own surfaces have no dark
 * values, so the light/dark switch and the layout controls (which carry the
 * mode and colour preset) are left out.
 */
export function StudioShell({
  canManage,
  children,
  name,
  orgSlug,
  pendingCount,
  publicHref,
  user,
}: Readonly<StudioShellProps>) {
  return (
    <AdminShell
      brand={{
        collapsedLogo: <BookingsMark />,
        hideName: true,
        href: `/studio/${orgSlug}/agenda`,
        logo: <BusinessBrand name={name} />,
        name,
      }}
      // On phones the sidebar is a sheet, so the business name sits in the top
      // bar (it is already in the sidebar from md up).
      breadcrumb={
        <Link
          aria-label={`${name}, agenda`}
          className={cn(
            FOCUS,
            "text-foreground flex min-h-11 max-w-[9rem] items-center truncate text-sm font-semibold sm:max-w-[14rem] md:hidden"
          )}
          href={{ pathname: `/studio/${orgSlug}/agenda` }}
          title={name}
        >
          <span className="truncate">{name}</span>
        </Link>
      }
      layoutControls={false}
      navigation={studioNavigation({
        canManage,
        orgSlug,
        pendingCount,
        publicHref,
      })}
      notifications={
        canManage ? (
          <Link
            aria-label="New booking"
            className={cn(
              FOCUS,
              "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-primary-foreground inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-[120ms] focus-visible:outline-offset-[-3px] [&_svg]:size-4"
            )}
            href={{ pathname: `/studio/${orgSlug}/bookings/new` }}
          >
            <CalendarPlus aria-hidden="true" />
            New<span className="max-sm:hidden">{" booking"}</span>
          </Link>
        ) : null
      }
      themeSwitcher={false}
      user={{ user, signOut: { action: "/auth/logout" } }}
    >
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    </AdminShell>
  );
}

/** The frame without a business: the picker, and pages reached with no session. */
export function StudioPlainFrame({
  children,
  userName,
}: Readonly<{ children: React.ReactNode; userName?: string }>) {
  return (
    <div className="bg-ground min-h-screen">
      <StudioSkipLink />
      {userName ? (
        <header className="border-border bg-background border-b">
          <div className="mx-auto flex min-h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 md:px-8">
            <span className="text-foreground font-bold">
              Barrels Bookings Studio
            </span>
            <div className="flex items-center gap-3">
              <span className="text-foreground/80 hidden text-sm sm:inline">
                {userName}
              </span>
              <form action="/auth/logout" method="post">
                <button
                  className={cn(
                    FOCUS,
                    "border-border text-foreground hover:bg-muted inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
                  )}
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
      ) : null}
      <main
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8"
        id="main-content"
      >
        {children}
      </main>
    </div>
  );
}
