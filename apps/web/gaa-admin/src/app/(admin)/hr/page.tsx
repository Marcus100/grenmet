import type { HrDashboardPublic } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import { HrDashboard } from "@/components/hr/dashboard/hr-dashboard";
import { loadDashboard } from "@/components/hr/dashboard/load-dashboard";

export const metadata: Metadata = {
  title: "Human Resources",
  description:
    "Consolidated HR dashboard for the Grenada Meteorological Service — requests, roster and people in one place.",
};

export default async function HrPage() {
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const data: HrDashboardPublic = await loadDashboard();
  return (
    <div className="space-y-4">
      <HrDashboard data={data} />
    </div>
  );
}
