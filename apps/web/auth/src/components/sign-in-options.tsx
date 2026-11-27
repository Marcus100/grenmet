import type { Route } from "next";
import Link from "next/link";
import { secondaryButtonClass, textLinkClass } from "@/components/form-styles";
import { signInPath } from "@/lib/sign-in-links";

/**
 * "Continue with Google". A plain link: /google/start redirects to Google, so a
 * client-side navigation would fetch a cross-origin redirect (it fails
 * connect-src and CORS rejects it). A full page load goes straight to Google.
 */
export function GoogleSignInLink({ returnTo }: { returnTo: string | null }) {
  return (
    <a
      className={secondaryButtonClass}
      href={signInPath("/google/start", { returnTo })}
    >
      Continue with Google
    </a>
  );
}

/**
 * The other ways in, kept behind one small disclosure so the first screen asks
 * a single question (the email). A native <details>: it opens without script.
 */
export function MoreWaysToSignIn({ passwordHref }: { passwordHref: Route }) {
  return (
    <details className="text-body-sm text-center">
      <summary className="text-muted-foreground hover:text-foreground inline-flex min-h-11 cursor-pointer items-center underline-offset-4 hover:underline">
        More ways to sign in
      </summary>
      <p className="mt-1">
        <Link
          className={`${textLinkClass} inline-flex min-h-11 items-center`}
          href={passwordHref}
        >
          Sign in with a password
        </Link>
      </p>
    </details>
  );
}
