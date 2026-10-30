import { Search } from "lucide-react";
import Link from "next/link";
import { DesktopNav } from "@/components/desktop-nav";
import { FlagStripe } from "@/components/flag-stripe";
import { MobileMenu } from "@/components/mobile-menu";

/**
 * Newspaper masthead: wordmark and the task-named bar when the masthead has 80rem of room, the
 * hamburger below it. `status` is the one-line state of the 2026 election.
 */
export function SiteHeader({ status }: { status: string }) {
  return (
    <header className="border-el-ink bg-background @container/masthead sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)]">
      <FlagStripe />
      <div className="mx-auto flex min-h-16 max-w-[1240px] flex-wrap items-center gap-1 px-4 sm:gap-4 sm:px-6 xl:gap-6">
        <Link
          aria-label="Elections Grenada home"
          className="text-el-ink flex shrink-0 items-baseline font-serif text-[1.375rem] leading-none font-bold tracking-[-0.02em]"
          href="/"
        >
          Elections <span className="font-normal italic">Grenada</span>
        </Link>
        <DesktopNav />
        <Link
          aria-label="Search Elections Grenada"
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center text-base underline underline-offset-4"
          href="/search"
        >
          <Search aria-hidden="true" className="size-5 sm:hidden" />
          <span className="sr-only sm:not-sr-only">Search</span>
        </Link>
        <div className="flex items-center @min-7xl/masthead:hidden">
          <MobileMenu status={status} />
        </div>
      </div>
    </header>
  );
}
