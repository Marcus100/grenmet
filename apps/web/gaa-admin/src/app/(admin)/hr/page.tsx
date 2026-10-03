import type { HrDashboardPublic } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import Link from "next/link";
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
      <nav aria-label="HR records" className="flex flex-wrap gap-4 text-sm">
        <Link className="underline" href="/hr/documents">
          Employee documents
        </Link>
        <Link className="underline" href="/hr/training">
          Employee training
        </Link>
        <Link className="underline" href="/hr/parking">
          Parking expiry
        </Link>
      </nav>
      <HrDashboard data={data} />
    </div>
  );
}
