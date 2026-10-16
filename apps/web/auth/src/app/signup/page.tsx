import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/components/SignUpForm";

export const metadata: Metadata = {
  title: "Create account — Grenmet Auth",
};

export default function SignUpPage() {
  return (
    <AuthShell
      greeting="Welcome"
      side="right"
      subtitle="One account for every app."
    >
      <AuthHeading title="Create your account">
        Create your account, then join the apps you need. We'll send a link to
        verify your email.
      </AuthHeading>
      <SignUpForm />
    </AuthShell>
  );
}
