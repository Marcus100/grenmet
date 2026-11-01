import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { textLinkClass } from "@/components/form-styles";
import { getSafeReturnTo, readQueryParam } from "@/lib/return-to";

export const metadata: Metadata = {
  title: "Create account — Grenmet Auth",
};
export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = getSafeReturnTo(readQueryParam(params.returnTo));
  return (
    <AuthShell
      greeting="Welcome"
      side="right"
      subtitle="One account for every app."
    >
      <AuthHeading title="Create your account">
        Enter your email. We'll send a 6-digit code; enter it and your account
        is ready. No password needed.
      </AuthHeading>
      <EmailCodeForm returnTo={returnTo} />
      <p className="mt-6 text-center text-body-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          className={textLinkClass}
          href={returnTo ? `/?returnTo=${encodeURIComponent(returnTo)}` : "/"}
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
