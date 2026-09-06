import type { Metadata } from "next";
import { UsersManager } from "@/components/users/users-manager";

export const metadata: Metadata = {
  title: "Users",
  description:
    "Manage staff accounts: onboarding, roles, and account access for the Grenada Meteorological Service",
};

export default function UsersPage() {
  return <UsersManager />;
}
