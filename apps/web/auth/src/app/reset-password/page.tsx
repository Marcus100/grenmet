import type { Metadata } from "next";
import Link from "next/link";
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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <section className="rounded-4xl border border-(--line) bg-(--panel-strong) p-7 shadow-gm-card md:p-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="font-mono text-(--muted) text-gm-label uppercase tracking-widest">
              Password recovery
            </div>
            <h1 className="font-semibold text-2xl text-foreground tracking-normal">
              Set a new password
            </h1>
          </div>

          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
                No reset token found. The link may have expired or been used
                already.
              </div>
              <Link
                className="block text-center text-(--auth-accent) text-sm underline-offset-4 hover:underline"
                href="/forgot-password"
              >
                Request a new link
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
