import type { Metadata } from "next";
import { SecurityUrlProvider } from "@/components/users/security-url";
import { UsersManager } from "@/components/users/users-manager";
import { getAuthAppUrl } from "@/lib/auth-config";

export const metadata: Metadata = {
  title: "Users",
  description:
    "Manage staff accounts: onboarding, roles, and account access for the Grenada Meteorological Service",
};

export default function UsersPage() {
  return (
    <SecurityUrlProvider url={new URL("/security", getAuthAppUrl()).toString()}>
      <UsersManager />
    </SecurityUrlProvider>
  );
}
