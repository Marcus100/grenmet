import type { Metadata } from "next";
import { ParkingApplication } from "@/components/hr/parking/parking-application";
import { ParkingExpiry } from "@/components/hr/parking/parking-expiry";
import { RecordsTabs } from "@/components/hr/records-tabs";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Parking expiry | GAA" };
export default function ParkingPage() {
  return (
    <div className="space-y-6">
      <RecordsTabs />
      <PageHeader title="Parking access" />
      <ParkingApplication />
      <ParkingExpiry />
    </div>
  );
}
