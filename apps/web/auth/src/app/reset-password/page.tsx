import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { readQueryParam } from "@/lib/return-to";

export const metadata: Metadata = {
  title: "Reset password — Grenmet Auth",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = readQueryParam(params.token);

  return (
    <AuthShell greeting="Almost there" subtitle="Choose a new password.">
      <AuthHeading title="Set a new password" />

      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-5">
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm"
            role="alert"
          >
            This reset link is missing its token. It may have expired or been
            used already.
          </div>
          <Link
            className="block text-center font-medium text-(--auth-accent) text-sm underline-offset-4 hover:underline"
            href="/forgot-password"
          >
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
