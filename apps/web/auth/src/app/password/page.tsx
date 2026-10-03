import type { Metadata } from "next";
import { AccountLayout } from "@/components/account-layout";
import { requireAccount } from "@/lib/account";
import { describePasswordAge } from "@/lib/profile";
import { loadSecurity } from "../security/actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Password — Grenmet Auth" };
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  await requireAccount();
  const security = await loadSecurity().catch(() => null);
  return (
    <AccountLayout
      current="/password"
      description="Changing your password signs you out of every session."
      title="Password"
    >
      {security ? (
        <p className="text-muted-foreground text-sm">
          {describePasswordAge(security.password_changed_at)}
        </p>
      ) : null}
      <ChangePasswordForm />
    </AccountLayout>
  );
}
