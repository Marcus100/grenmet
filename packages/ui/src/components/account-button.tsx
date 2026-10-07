"use client";

import { Button, buttonVariants } from "@barrelsgd/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@barrelsgd/ui/components/ui/popover";
import { cn } from "@barrelsgd/ui/lib/utils";
import { UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Mirrors `AccountStatus` from `@barrelsgd/auth/server` (`GET /auth/me`). */
interface AccountStatus {
  readonly accountUrl?: string;
  readonly email?: string;
  readonly name?: string;
  readonly notice?: boolean;
  readonly signedIn: boolean;
}

async function signOut() {
  try {
    await fetch("/auth/logout", { method: "POST" });
  } finally {
    window.location.reload();
  }
}

/**
 * "Sign in" / account menu for sites that sign in through auth.barrels.gd
 * (ADR-0017). Loads the account in the browser so pages stay static. The site
 * must mount `/auth/start`, `/auth/callback`, `/auth/me` and `/auth/logout`.
 */
export function AccountButton({
  appLabel,
  className,
}: {
  readonly appLabel: string;
  readonly className?: string;
}) {
  const pathname = usePathname() || "/";
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/auth/me", { cache: "no-store" })
      .then((response) =>
        response.ok ? (response.json() as Promise<AccountStatus>) : null
      )
      .catch(() => null)
      .then((status) => {
        if (!active) return;
        const value = status ?? { signedIn: false };
        setAccount(value);
        setNoticeOpen(Boolean(value.signedIn && value.notice));
      });
    return () => {
      active = false;
    };
  }, []);

  // Reserve the space while loading so the header doesn't shift.
  if (account === null) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block h-8 w-20", className)}
      />
    );
  }

  if (!account.signedIn) {
    return (
      // A plain link: signing in is navigation, not an in-page action.
      <a
        className={cn(
          buttonVariants({ size: "sm", variant: "outline" }),
          className
        )}
        href={`/auth/start?${new URLSearchParams({ returnTo: pathname })}`}
      >
        Sign in
      </a>
    );
  }

  const firstName = account.name?.split(" ")[0] || "Account";
  return (
    <>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              aria-label={`Account: ${account.name}`}
              className={className}
              size="sm"
              variant="outline"
            >
              <UserRound aria-hidden="true" />
              <span className="hidden sm:inline">{firstName}</span>
            </Button>
          }
        />
        <PopoverContent align="end" className="w-64">
          <div className="space-y-0.5 px-1">
            <p className="font-medium">{account.name}</p>
            <p className="truncate text-muted-foreground">{account.email}</p>
          </div>
          {account.accountUrl ? (
            <a
              className={buttonVariants({ size: "sm", variant: "ghost" })}
              href={account.accountUrl}
            >
              Manage your Barrels account
            </a>
          ) : null}
          <Button onClick={signOut} size="sm" variant="ghost">
            Sign out of {appLabel}
          </Button>
        </PopoverContent>
      </Popover>
      {noticeOpen ? (
        <section
          aria-label="Signed in"
          className="fixed top-4 right-4 left-4 z-50 flex items-start gap-3 rounded-lg border border-border bg-background p-4 text-foreground text-sm shadow-card sm:left-auto sm:max-w-sm"
          role="status"
        >
          <p className="flex-1">
            You're signed in to {appLabel} with your Barrels account (
            {account.email}). Not you?{" "}
            <button className="underline" onClick={signOut} type="button">
              Sign out
            </button>
          </p>
          <button
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setNoticeOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </section>
      ) : null}
    </>
  );
}
