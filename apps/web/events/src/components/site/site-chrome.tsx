import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { LayoutDashboard, Ticket } from "lucide-react";
import Link from "next/link";
import { PersonAvatar } from "@/components/community/person-avatar";
import { isSignedIn } from "@/data/viewer-profile";
import type { Profile } from "@/domain/types";
import { BottomNav, HeaderNav } from "./nav-link";

export function Wordmark() {
  return (
    <Link className="flex items-center gap-2" href="/">
      <span className="flex size-9 items-center justify-center rounded-xl bg-events-ink text-events-lime">
        <Ticket className="size-5" />
      </span>
      <span className="font-bold font-display text-body-base leading-none tracking-tight">
        Barrels <span className="text-events-hibiscus">Events</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ viewer }: { viewer: Profile }) {
  return (
    <header className="sticky top-0 z-40 border-border border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark />
        <HeaderNav />
        <div className="flex items-center gap-2">
          <Link
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "hidden sm:inline-flex"
            )}
            href="/dash/events"
          >
            <LayoutDashboard data-icon="inline-start" />
            For organisers
          </Link>
          {isSignedIn(viewer) ? (
            <Link aria-label="My plans" className="rounded-full" href="/me">
              <PersonAvatar name={viewer.name} />
            </Link>
          ) : (
            <Link className={buttonVariants()} href="/sign-in">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteBottomNav() {
  return <BottomNav />;
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-border border-t bg-events-ink pb-24 text-white md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div className="space-y-2">
          <p className="font-bold font-display text-body-base">
            Barrels <span className="text-events-lime">Events</span>
          </p>
          <p className="text-body text-white/70">
            What's on across Grenada, Carriacou and Petite Martinique.
          </p>
        </div>
        <nav aria-label="Footer" className="grid gap-2 text-body text-white/80">
          <Link className="hover:text-white" href="/events">
            Calendar
          </Link>
          <Link className="hover:text-white" href="/groups">
            Groups & meetups
          </Link>
          <Link className="hover:text-white" href="/events/suggest">
            Suggest an event
          </Link>
          <Link className="hover:text-white" href="/dash/events">
            Organiser dashboard
          </Link>
        </nav>
        <p className="text-caption text-white/60">A Barrels Grenada product.</p>
      </div>
    </footer>
  );
}
