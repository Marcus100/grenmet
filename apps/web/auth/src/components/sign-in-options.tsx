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

export function CreateAccountLink({ returnTo }: { returnTo: string | null }) {
  return (
    <p className="text-body-sm text-muted-foreground text-center">
      New here?{" "}
      <Link
        className={textLinkClass}
        href={signInPath("/signup", { returnTo })}
      >
        Create an account
      </Link>
    </p>
  );
}
