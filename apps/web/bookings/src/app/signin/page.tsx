import { getSafeLocalReturnTo } from "@barrelsgd/auth/server";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Barrels Bookings with your Barrels account.",
};

export const dynamic = "force-dynamic";

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.trim() || null;
}

/**
 * Single sign-on (ADR-0017): /auth/start hands off to auth.barrels.gd. A failed
 * hand-off lands back here with `sign_in=expired`; redirecting again would
 * loop, so say what happened and let the person retry.
 */
export default async function SignIn({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const returnTo = getSafeLocalReturnTo(first(params.returnTo)) ?? "/studio";
  const start = `/auth/start?${new URLSearchParams({ returnTo })}`;

  if (first(params.sign_in) !== "expired") redirect(start as Route);

  return (
    <main
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6"
      id="main-content"
    >
      <h1 className="font-semibold text-2xl">Sign-in did not finish</h1>
      <p className="text-muted-foreground" role="alert">
        The sign-in link expired or was refused. Try again, or contact Barrels
        Grenada if it keeps happening.
      </p>
      <a
        className="w-fit rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        href={start}
      >
        Try again
      </a>
    </main>
  );
}
