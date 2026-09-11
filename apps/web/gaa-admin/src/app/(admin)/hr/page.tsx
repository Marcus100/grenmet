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
  let data: HrDashboardPublic;
  try {
    data = await loadDashboard();
  } catch {
    return (
      <div className="space-y-3 p-6" role="alert">
        <h1 className="font-semibold text-2xl">Human Resources</h1>
        <p>HR records could not be loaded. Refresh this page to retry.</p>
      </div>
    );
  }
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
