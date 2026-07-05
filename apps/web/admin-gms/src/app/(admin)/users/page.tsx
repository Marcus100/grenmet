import type { Metadata } from "next";
import { UsersManager } from "@/components/users/users-manager";

export const metadata: Metadata = {
  title: "Users",
  description:
    "Manage staff accounts: onboarding, roles, and account access for the Grenada Meteorological Service",
};

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">
          Onboard staff, assign roles, and manage account access.
        </p>
      </div>
      <UsersManager />
    </div>
  );
}
