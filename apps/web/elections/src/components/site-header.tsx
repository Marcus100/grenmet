import Link from "next/link";
import { DesktopNav } from "@/components/desktop-nav";
import { MobileMenu } from "@/components/mobile-menu";

/**
 * Newspaper masthead: wordmark and the task-named bar from `lg` up, the
 * hamburger below it. `status` is the one-line state of the 2026 election.
 */
export function SiteHeader({ status }: { status: string }) {
  return (
    <header className="sticky top-0 z-40 border-el-ink border-b bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-4 px-4 sm:px-6 xl:gap-6">
        <Link
          aria-label="Elections Grenada home"
          className="flex shrink-0 items-baseline font-bold font-serif text-[22px] text-el-ink leading-none tracking-[-0.02em]"
          href="/"
        >
          Elections <span className="font-normal italic">Grenada</span>
        </Link>
        <DesktopNav />
        <div className="ml-auto flex items-center lg:hidden">
          <MobileMenu status={status} />
        </div>
      </div>
    </header>
  );
}
