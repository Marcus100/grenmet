import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { getSafeReturnTo, readQueryParam } from "@/lib/return-to";

export const metadata: Metadata = { title: "Sign in with a code — Barrels" };
export const dynamic = "force-dynamic";

export default async function EmailCodePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <AuthShell greeting="Hello" subtitle="One account for every app.">
      <AuthHeading title="Sign in with an email code">
        No password needed. We'll email you a one-time code.
      </AuthHeading>
      <EmailCodeForm
        returnTo={getSafeReturnTo(readQueryParam(params.returnTo))}
      />
    </AuthShell>
  );
}
