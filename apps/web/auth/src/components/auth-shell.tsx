import { MAIN_CONTENT_ID } from "@barrelsgd/ui/components/ui/skip-link";
import {
  BARRELS_SUPPORT_EMAIL,
  BARRELS_SUPPORT_HREF,
} from "@barrelsgd/ui/lib/support";
import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

interface AuthShellProps {
  readonly children: ReactNode;
  /**
   * Signed-in account pages pass their app list here. Signed-out pages pass
   * nothing: a visitor never sees the apps other organisations run.
   */
  readonly sidebar?: ReactNode;
  /** Account pages need a wider content column than a single form. */
  readonly wide?: boolean;
}

/** The Barrels platform frame for every page in this app (one column, phone first). */
export function AuthShell({ children, sidebar, wide = false }: AuthShellProps) {
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-4 sm:px-8">
        <Link
          className="text-primary inline-flex min-h-11 items-center text-lg font-semibold tracking-tight"
          href="/"
        >
          Barrels
        </Link>
        <ThemeToggle />
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-12 px-4 pb-12 sm:px-8">
        {sidebar ? (
          <aside
            className="hidden w-60 shrink-0 pt-8 lg:block"
            data-testid="app-panel"
          >
            {sidebar}
          </aside>
        ) : null}

        <main
          className="flex min-w-0 flex-1 flex-col justify-center py-8 focus:outline-none"
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
        >
          <div
            className={cn(
              "mx-auto w-full space-y-8",
              wide ? "max-w-2xl" : "max-w-md"
            )}
          >
            {children}
            <p className="text-muted-foreground text-center text-sm">
              Need help with your Barrels account? Email Barrels Grenada support
              at{" "}
              <a
                className="underline underline-offset-4"
                href={BARRELS_SUPPORT_HREF}
              >
                {BARRELS_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

interface AuthHeadingProps {
  readonly children?: ReactNode;
  readonly title: string;
}

export function AuthHeading({ children, title }: AuthHeadingProps) {
  return (
    <div className="space-y-2">
      <h1 className="text-foreground text-2xl font-semibold">{title}</h1>
      {children ? (
        <p className="text-muted-foreground text-sm leading-6">{children}</p>
      ) : null}
    </div>
  );
}
