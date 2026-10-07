import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { ActivationForm } from "./activation-form";

export const metadata: Metadata = {
  title: "Activate your staff account",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <AuthShell greeting="Welcome" subtitle="Set up your work account.">
      <AuthHeading title="Choose your password">
        Your administrator has confirmed your identity. Keep this work account
        separate from your personal account. No email inbox is needed for this
        step.
      </AuthHeading>
      <ActivationForm />
    </AuthShell>
  );
}
