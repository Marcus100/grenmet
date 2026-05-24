import type { Metadata } from "next";
import { SignUpForm } from "@/components/SignUpForm";

export const metadata: Metadata = {
  title: "Create account — Grenmet Auth",
};

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <section className="rounded-4xl border border-(--line) bg-(--panel-strong) p-7 shadow-[0_24px_80px_rgba(24,32,28,0.08)] md:p-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="font-mono text-(--muted) text-[11px] uppercase tracking-[0.24em]">
              Registration
            </div>
            <h1 className="font-semibold text-2xl text-foreground tracking-[-0.04em]">
              Create your account
            </h1>
            <p className="text-(--muted) text-sm leading-6">
              One account for every Grenmet web app.
            </p>
          </div>

          <SignUpForm />
        </div>
      </section>
    </main>
  );
}
