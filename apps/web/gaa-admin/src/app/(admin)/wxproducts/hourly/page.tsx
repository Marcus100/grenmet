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
        SYNOP / wxRegister: hourly observations, on the hour. The register below
        is a development example; transmitted status is illustrative.
      </p>
      <ERegister />
    </div>
  );
}
