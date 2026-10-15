import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { signOutAction } from "@/app/actions";
import { APP_GROUPS, findRequestedApp } from "@/components/app-directory";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getAppHrefs } from "@/lib/app-links";
import { readQueryParam } from "@/lib/return-to";
import { readSessionCookie } from "@/lib/session";

export const metadata: Metadata = { title: "Signed out — Barrels account" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const BUTTON =
  "rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted";

function appName(requested: string | null): string {
  const id = findRequestedApp(requested);
  for (const group of APP_GROUPS) {
    const app = group.apps.find((entry) => entry.id === id);
    if (app) return app.name;
  }
  return "this app";
}

/**
 * Where an app's Log out lands (ADR-0017). Sending the browser straight back to
 * the app would sign it in again through the still-live account session, so say
 * what happened and let the person choose.
 */
export default async function SignedOutPage({ searchParams }: PageProps) {
  noStore();
  const params = await searchParams;
  const requested = readQueryParam(params.app);
  const everywhere = readQueryParam(params.all) === "1";
  const accountSignedIn = Boolean(await readSessionCookie());

  if (everywhere || !accountSignedIn) {
    return (
      <AuthShell greeting="Signed out" subtitle="See you soon.">
        <AuthHeading title="You're signed out of all apps">
          Nothing on this device is signed in to your Barrels account.
        </AuthHeading>
        <a className={BUTTON} href="/">
          Sign in
        </a>
      </AuthShell>
    );
  }

  const name = appName(requested);
  const appHref = getAppHrefs()[findRequestedApp(requested) ?? "admin"];
  return (
    <AuthShell
      greeting="Signed out"
      requestedApp={requested}
      subtitle="Your other apps are unaffected."
    >
      <AuthHeading title={`You signed out of ${name}`}>
        You're still signed in to your Barrels account, so opening {name} again
        signs you straight back in. Sign out of all apps to end every session.
      </AuthHeading>
      <div className="flex flex-wrap gap-3">
        {findRequestedApp(requested) && appHref ? (
          <a className={BUTTON} href={appHref}>
            Sign in to {name} again
          </a>
        ) : null}
        <form action={signOutAction}>
          <input name="returnTo" type="hidden" value="/signed-out?all=1" />
          <button className={BUTTON} type="submit">
            Sign out of all apps
          </button>
        </form>
        <a className={BUTTON} href="/">
          Your account
        </a>
      </div>
    </AuthShell>
  );
}
