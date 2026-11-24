import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { StudioIcon } from "@/components/studio/studio-icons";
import { StudioSidebarNav, StudioTabBar } from "@/components/studio/studio-nav";
import { FOCUS } from "@/components/studio/studio-ui";

export interface StudioShellProps {
  canCreate: boolean;
  canPlan: boolean;
  children: React.ReactNode;
  /** The business's name; the slug stands in when it could not be read. */
  name: string;
  orgSlug: string;
  pendingCount: number | null;
  /** The customers' booking page (`/<public slug>`), when the business has one. */
  publicHref: string | null;
  /** The signed-in person's name. */
  userName: string;
}

const LINK =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 font-medium text-foreground transition-colors duration-[120ms] hover:bg-muted active:bg-muted";

function FooterLinks({
  publicHref,
  userName,
}: Readonly<{ publicHref: string | null; userName: string }>) {
  return (
    <div className="space-y-1">
      <p className="text-foreground/80 truncate px-3 text-sm">{userName}</p>
      {publicHref ? (
        <Link className={cn(FOCUS, LINK)} href={{ pathname: publicHref }}>
          <StudioIcon name="external" />
          View my page
        </Link>
      ) : null}
      <form action="/auth/logout" method="post">
        <button className={cn(FOCUS, LINK)} type="submit">
          <StudioIcon name="sign-out" />
          Sign out
        </button>
      </form>
    </div>
  );
}

/**
 * The studio frame, laid out like the staff portal: a fixed left navigation
 * with the business on laptops; on phones a compact top bar and a bottom tab
 * bar. The page itself is the `main` landmark, padded so no bar covers it.
 */
export function StudioShell({
  canCreate,
  canPlan,
  children,
  name,
  orgSlug,
  pendingCount,
  publicHref,
  userName,
}: Readonly<StudioShellProps>) {
  const nav = { canCreate, canPlan, orgSlug, pendingCount };
  const footer = <FooterLinks publicHref={publicHref} userName={userName} />;
  return (
    <div className="bg-ground min-h-screen">
      <aside className="border-border bg-background fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r md:flex">
        <div className="space-y-1 px-5 pt-6 pb-4">
          <p className="text-foreground text-lg leading-tight font-bold break-words">
            {name}
          </p>
          {publicHref ? (
            <Link
              className={cn(
                FOCUS,
                "text-primary inline-flex min-h-11 items-center text-sm font-medium break-all underline underline-offset-4"
              )}
              href={{ pathname: publicHref }}
            >
              {publicHref}
            </Link>
          ) : (
            <p className="text-foreground/80 text-sm">Bookings Studio</p>
          )}
        </div>
        <StudioSidebarNav {...nav} />
        <div className="border-border border-t px-3 py-3">{footer}</div>
      </aside>

      <header className="border-border bg-background sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 border-b px-4 md:hidden">
        <Link
          className={cn(
            FOCUS,
            "text-foreground min-w-0 truncate text-base font-bold"
          )}
          href={{ pathname: `/studio/${orgSlug}/agenda` }}
        >
          {name}
        </Link>
        {canCreate ? (
          <Link
            className={cn(
              FOCUS,
              "bg-primary text-primary-foreground active:bg-primary/80 inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-full px-4 text-sm font-semibold transition-colors duration-[120ms]"
            )}
            href={{ pathname: `/studio/${orgSlug}/bookings/new` }}
          >
            <StudioIcon className="size-4" name="plus" />
            New booking
          </Link>
        ) : null}
      </header>

      <main
        className="w-full px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pt-8 md:pr-8 md:pb-10 md:pl-68"
        id="main-content"
      >
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>

      <StudioTabBar {...nav} footer={footer} />
    </div>
  );
}

/** The frame without a business: the picker, and pages reached with no session. */
export function StudioPlainFrame({
  children,
  userName,
}: Readonly<{ children: React.ReactNode; userName?: string }>) {
  return (
    <div className="bg-ground min-h-screen">
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
