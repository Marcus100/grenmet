import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password — Grenmet Auth",
};

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <section className="rounded-4xl border border-(--line) bg-(--panel-strong) p-7 shadow-[0_24px_80px_rgba(24,32,28,0.08)] md:p-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="font-mono text-(--muted) text-[11px] uppercase tracking-[0.24em]">
              Password recovery
            </div>
            <h1 className="font-semibold text-2xl text-foreground tracking-[-0.04em]">
              Reset your password
            </h1>
            <p className="text-(--muted) text-sm leading-6">
              Enter the email linked to your account and we'll send a reset
              link.
            </p>
          </div>

          <ForgotPasswordForm />
        </div>
      </section>
    </main>
  );
}
