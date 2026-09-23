import { Logo } from "@barrelsgd/gms/components/logo";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { ReactNode } from "react";
import { AppDirectory, type AppId } from "@/components/app-directory";
import { ThemeToggle } from "@/components/theme-toggle";

interface AuthShellProps {
  readonly children: ReactNode;
  readonly greeting: string;
  /** Account pages pass links; sign-in pages list the apps without them. */
  readonly hrefs?: Partial<Record<AppId, string>>;
  readonly requestedApp?: string | null;
  /** Which side the brand panel sits on. */
  readonly side?: "left" | "right";
  readonly subtitle: string;
  /** Account pages need a wider content column than a single form. */
  readonly wide?: boolean;
}

export function AuthShell({
  children,
  greeting,
  hrefs,
  requestedApp,
  side = "left",
  subtitle,
  wide = false,
}: AuthShellProps) {
  return (
    <div
      className={cn(
        "flex min-h-dvh",
        side === "right" && "lg:flex-row-reverse"
      )}
    >
      {/* `dark` scopes the white logo asset and dark tokens to the navy panel. */}
      <aside
        className="dark hidden bg-gm-navy lg:flex lg:w-1/3 lg:flex-col lg:justify-between lg:gap-10 lg:p-10 xl:p-12"
        data-testid="brand-panel"
      >
        <Logo className="h-8 w-auto self-start" priority />
        <div className="space-y-2">
          <p className="font-light text-5xl text-gm-text-inverse">{greeting}</p>
          <p className="text-gm-surface-muted text-xl">{subtitle}</p>
        </div>
        <AppDirectory hrefs={hrefs} requestedApp={requestedApp} />
      </aside>

      <main className="relative flex w-full items-center justify-center bg-background px-4 py-16 sm:px-8 lg:w-2/3">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div
          className={cn("w-full space-y-8", wide ? "max-w-2xl" : "max-w-md")}
        >
          <Logo className="h-7 w-auto lg:hidden" />
          {children}
        </div>
      </main>
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
      <h1 className="font-semibold text-2xl text-foreground">{title}</h1>
      {children ? (
        <p className="text-muted-foreground text-sm leading-6">{children}</p>
      ) : null}
    </div>
  );
}
