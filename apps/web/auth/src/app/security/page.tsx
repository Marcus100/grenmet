import type { Metadata } from "next";
import Link from "next/link";
import {
  AccountLayout,
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { requireAccount } from "@/lib/account";
import { loadSecurity } from "./actions";
import { TwoStepSettings } from "./two-step-settings";

export const metadata: Metadata = { title: "Security — Grenmet Auth" };
export const dynamic = "force-dynamic";

const outlineLink =
  "rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted";

export default async function SecurityPage() {
  await requireAccount();
  const security = await loadSecurity().catch(() => null);

  return (
    <AccountLayout
      current="/security"
      description="Two-step verification and the ways you can sign in."
      title="Security"
    >
      {security ? (
        <div className="space-y-10">
          <SettingsSection title="Two-step verification">
            <TwoStepSettings
              enabled={security.totp_enabled}
              recoveryCodesRemaining={security.recovery_codes_remaining ?? 0}
            />
          </SettingsSection>

          <SettingsSection title="Sign-in methods">
            <SettingsRow
              action={
                security.email_verified ? null : (
                  <Link className={outlineLink} href="/verify-email">
                    Verify
                  </Link>
                )
              }
              description="Sign in with your email and password."
              title="Email"
            >
              {security.email_verified ? (
                <StatusBadge tone="on">Verified</StatusBadge>
              ) : (
                <StatusBadge tone="off">Not verified</StatusBadge>
              )}
            </SettingsRow>
            <SettingsRow
              action={
                security.google_configured && !security.google_linked ? (
                  <Link className={outlineLink} href="/google/start">
                    Connect
                  </Link>
                ) : null
              }
              description={
                security.google_configured
                  ? "Sign in with the Google account that matches your email."
                  : "Google sign-in isn't available yet."
              }
              title="Google"
            >
              {security.google_linked ? (
                <StatusBadge tone="on">Connected</StatusBadge>
              ) : (
                <StatusBadge tone="off">Not connected</StatusBadge>
              )}
            </SettingsRow>
          </SettingsSection>
        </div>
      ) : (
        <p className="text-destructive text-sm" role="alert">
          Security details could not be loaded. Refresh to try again.
        </p>
      )}
    </AccountLayout>
  );
}
