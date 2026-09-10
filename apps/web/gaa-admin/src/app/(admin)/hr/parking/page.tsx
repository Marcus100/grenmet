import type { Metadata } from "next";
import { ParkingExpiry } from "@/components/hr/parking/parking-expiry";

export const metadata: Metadata = { title: "Parking expiry | GAA" };
export default function ParkingPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-medium text-3xl">Parking expiry</h1>
      <ParkingExpiry />
    </div>
  );
}
