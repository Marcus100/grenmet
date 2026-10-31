import { getSafeLocalReturnTo } from "@barrelsgd/auth/server";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Sign in to the warning desk",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.trim() || null;
}

/** Only desk addresses: sign-in never sends a forecaster to a public page. */
function deskReturnTo(value: string | null): string {
  const safe = getSafeLocalReturnTo(value);
  return safe && (safe === "/desk" || safe.startsWith("/desk/"))
    ? safe
    : "/desk";
}

/**
 * Single sign-on (ADR-0017): /auth/start hands off to auth.barrels.gd. A failed
 * hand-off lands back here with `sign_in=expired`; redirecting again would
 * loop, so say what happened and let the forecaster retry.
 */
export default async function DeskSignIn({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const returnTo = deskReturnTo(first(params.returnTo));
  const start = `/auth/start?${new URLSearchParams({ returnTo })}`;

  if (!env.CAP_SSO_CLIENT_SECRET) {
    return (
      <section className="mx-auto max-w-xl space-y-3 py-10">
        <h1 className="font-semibold text-2xl">Desk sign-in is switched off</h1>
        <p className="text-muted-foreground" role="alert">
          This server has no single sign-on secret for the warning desk. Use the
          CAP desk in GAA Admin until it is set.
        </p>
      </section>
    );
  }
  if (first(params.sign_in) !== "expired") redirect(start as Route);

  return (
    <section className="mx-auto max-w-xl space-y-4 py-10">
      <h1 className="font-semibold text-2xl">Sign-in did not finish</h1>
      <p className="text-muted-foreground" role="alert">
        The sign-in link expired or was refused. The warning desk is for
        approved GMS staff with access to CAP warnings.
      </p>
      <a
        className="inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        href={start}
      >
        Try again
      </a>
    </section>
  );
}
