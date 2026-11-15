import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { SuperuserInviteForm } from "./invite-form";

// The token arrives in the link's fragment (#token=...), which browsers never send to
// the server or in a Referer header. The page reads it in the browser, removes it from
// the address bar, and posts it in a request body. No referrer leaves this page.
export const metadata: Metadata = {
  referrer: "no-referrer",
  title: "Accept administrator invitation — Barrels",
};

export default function SuperuserInvitePage() {
  return (
    <AuthShell
      greeting="Barrels administrator"
      subtitle="Accept your invitation."
    >
      <AuthHeading title="Accept your administrator invitation">
        Confirm this address, then set up two-step sign-in.
      </AuthHeading>
      <SuperuserInviteForm />
    </AuthShell>
  );
}
