"use client";

import { useEffect } from "react";

/**
 * "Taking you to sign in": shown while the browser moves to the single sign-on
 * hop (ADR-0017). It says why the page changed instead of a blank screen, and
 * keeps a link for when the move does not happen (a slow network, or the
 * script did not run).
 */
export function SignInHandOff({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <main
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6"
      id="main-content"
    >
      <h1 className="text-2xl font-semibold">Taking you to sign in</h1>
      <p className="text-muted-foreground" role="status">
        Your account is kept on the Barrels sign-in page. You will come back to
        this page once you are signed in.
      </p>
      <a
        className="hover:bg-muted inline-flex min-h-11 w-fit items-center rounded-md border px-3 py-1.5 text-sm"
        href={href}
      >
        Continue to sign in
      </a>
    </main>
  );
}
