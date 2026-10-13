import type { Metadata } from "next";
import { ParkingApplication } from "@/components/hr/parking/parking-application";
import { ParkingExpiry } from "@/components/hr/parking/parking-expiry";
import { RecordsTabs } from "@/components/hr/records-tabs";

export const metadata: Metadata = { title: "Parking expiry | GAA" };
export default function ParkingPage() {
  return (
    <div className="space-y-6">
      <RecordsTabs />
      <h1 className="font-medium text-3xl">Parking access</h1>
      <ParkingApplication />
      <ParkingExpiry />
    </div>
  );
}
