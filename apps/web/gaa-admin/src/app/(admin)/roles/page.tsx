import type { Metadata } from "next";
import { RolesManager } from "@/components/roles/roles-manager";

export const metadata: Metadata = {
  title: "Roles",
  description:
    "Manage access roles and the staff assigned to them for the Grenada Meteorological Service",
};

export default function RolesPage() {
  return <RolesManager />;
}
