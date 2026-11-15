import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { getSafeReturnTo, readQueryParam } from "@/lib/return-to";
import { signInPath } from "@/lib/sign-in-links";

export const metadata: Metadata = { title: "Sign in with a code — Barrels" };
export const dynamic = "force-dynamic";

export default async function EmailCodePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = getSafeReturnTo(readQueryParam(params.returnTo));
  return (
    <AuthShell>
      <AuthHeading title="Sign in with an email code">
        No password needed. We’ll email you a one-time code.
      </AuthHeading>
      <EmailCodeForm
        passwordHref={signInPath("/", {
          app: readQueryParam(params.app),
          method: "password",
          returnTo,
        })}
        returnTo={returnTo}
      />
    </AuthShell>
  );
}
