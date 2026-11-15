import Link from "next/link";
import { secondaryButtonClass, textLinkClass } from "@/components/form-styles";
import { signInPath } from "@/lib/sign-in-links";

/**
 * "Continue with Google". No prefetch: /google/start redirects to Google, and a
 * prefetch of it fails CORS and logs a console error on every visit.
 */
export function GoogleSignInLink({ returnTo }: { returnTo: string | null }) {
  return (
    <Link
      className={secondaryButtonClass}
      href={signInPath("/google/start", { returnTo })}
      prefetch={false}
    >
      Continue with Google
    </Link>
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
