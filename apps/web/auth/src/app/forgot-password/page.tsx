import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password — Barrels",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <AuthHeading title="Reset your password">
        Enter the email linked to your account and we'll send a reset link.
      </AuthHeading>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
