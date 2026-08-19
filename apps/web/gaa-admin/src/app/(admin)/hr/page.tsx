import type { Metadata } from "next";
import { HrDashboard } from "@/components/hr/dashboard/hr-dashboard";

export const metadata: Metadata = {
  title: "Human Resources",
  description:
    "Consolidated HR dashboard for the Grenada Meteorological Service — requests, roster and people in one place.",
};

export default function HrPage() {
  return <HrDashboard />;
}
