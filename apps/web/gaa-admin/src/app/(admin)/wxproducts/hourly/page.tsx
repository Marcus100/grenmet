import type { Metadata } from "next";
import { ERegister } from "@/components/wxproducts/eregister";

export const metadata: Metadata = {
  title: "wxRegister (Hourly)",
  description:
    "Meteorological observations register for Maurice Bishop International Airport — station 78958.",
};

export default function HourlyPage() {
  return (
    <div className="space-y-5">
      <p className="rounded-lg border bg-card p-4">
        SYNOP / wxRegister: staff observations are loaded from the dedicated
        eRegister database. Transmission and WIS2box publication require
        explicit approval.
      </p>
      <ERegister />
    </div>
  );
}
