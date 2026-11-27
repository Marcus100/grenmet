import { AccountMenu } from "@barrelsgd/ui/components/account-menu";
import { env } from "@/env";
import { SIGN_OUT_ACTION, sessionOrNull } from "@/lib/signed-in-visitor";

/** Where a signed-out visitor goes to sign in, and comes back to `returnTo`. */
export function signInHrefFor(returnTo: string): string {
  return `/signin?${new URLSearchParams({ returnTo })}`;
}

/**
 * The account corner control for the home page: "Sign in" when signed out, the
 * account menu when signed in. Server only: the session is read here and only
 * the display values reach the menu. `className` positions it; it applies to
 * whichever control is drawn.
 */
export async function AccountControl({
  className,
  returnTo = "/",
}: Readonly<{ className?: string; returnTo?: string }>) {
  const session = await sessionOrNull();
  if (!session) {
    return (
      <AccountMenu
        className={className}
        signInHref={signInHrefFor(returnTo)}
        user={null}
      />
    );
  }
  return (
    <AccountMenu
      accountUrl={env.ACCOUNT_APP_URL}
      className={className}
      signOut={{ href: SIGN_OUT_ACTION }}
      user={{ email: session.email, name: session.fullName || null }}
    />
  );
}
