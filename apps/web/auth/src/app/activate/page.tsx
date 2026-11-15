import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ActivationForm } from "./activation-form";

export const metadata: Metadata = {
  title: "Activate your staff account",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <AuthShell>
      <ActivationForm />
    </AuthShell>
  );
}
