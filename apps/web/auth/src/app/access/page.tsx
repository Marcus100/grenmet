import type { Metadata } from "next";
import {
  AccountLayout,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { requireAccount } from "@/lib/account";
import { groupPermissions } from "@/lib/permissions";
import { loadAccess } from "../security/actions";

export const metadata: Metadata = { title: "Access — Grenmet Auth" };
export const dynamic = "force-dynamic";

export default async function AccessPage() {
  await requireAccount();
  const access = await loadAccess().catch(() => null);

  return (
    <AccountLayout
      current="/access"
      description="What your roles let you do. Ask an administrator to change them."
      title="Access"
    >
      {access ? (
        <div className="space-y-10">
          <SettingsSection title="Roles">
            <div className="flex flex-wrap gap-2 py-5">
              {access.is_superuser ? (
                <StatusBadge tone="on">Administrator</StatusBadge>
              ) : null}
              {access.role_names.map((role) => (
                <StatusBadge key={role} tone="neutral">
                  {role}
                </StatusBadge>
              ))}
              {access.role_names.length === 0 && !access.is_superuser ? (
                <p className="text-muted-foreground text-sm">
                  No roles yet. An administrator assigns them after approving
                  your account.
                </p>
              ) : null}
            </div>
          </SettingsSection>

          <SettingsSection title="Permissions">
            {access.is_superuser ? (
              <p className="py-5 text-muted-foreground text-sm">
                Administrators have every permission.
              </p>
            ) : null}
            {groupPermissions(access.permission_keys).map(([area, keys]) => (
              <details className="group py-4" key={area}>
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-foreground text-sm">
                  <span className="capitalize">
                    {area.replaceAll("_", " ")}
                  </span>
                  <span className="text-muted-foreground">
                    {keys.length}{" "}
                    {keys.length === 1 ? "permission" : "permissions"}
                  </span>
                </summary>
                <ul className="mt-3 space-y-1 font-mono text-body-sm text-muted-foreground">
                  {keys.map((key) => (
                    <li key={key}>{key}</li>
                  ))}
                </ul>
              </details>
            ))}
          </SettingsSection>
        </div>
      ) : (
        <p className="text-destructive text-sm" role="alert">
          Access details could not be loaded. Refresh to try again.
        </p>
      )}
    </AccountLayout>
  );
}
