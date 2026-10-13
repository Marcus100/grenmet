import type { Metadata } from "next";
import { ERegister } from "@/components/wxproducts/eregister";

export const metadata: Metadata = {
  title: "Weather Electronic Register (Hourly)",
  description:
    "Meteorological observations register for Maurice Bishop International Airport — station 78958.",
};

export default function HourlyPage() {
  return (
    <div className="space-y-5">
      <ERegister />
    </div>
  );
}
