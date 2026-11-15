import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { textLinkClass } from "@/components/form-styles";
import { getSafeReturnTo, readQueryParam } from "@/lib/return-to";
import { signInPath } from "@/lib/sign-in-links";

export const metadata: Metadata = {
  title: "Create account — Barrels",
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
    <AuthShell>
      <AuthHeading title="Create your account">
        Enter your email. We’ll send a 6-digit code; enter it and your account
        is ready. No password needed.
      </AuthHeading>
      <EmailCodeForm purpose="sign-up" returnTo={returnTo} />
      <p className="text-body-sm text-muted-foreground mt-6 text-center">
        Already have an account?{" "}
        <Link className={textLinkClass} href={signInPath("/", { returnTo })}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
