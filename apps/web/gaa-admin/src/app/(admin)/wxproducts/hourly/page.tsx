import type { Metadata } from "next";
import { WideContent } from "@/components/layout/wide-content";
import { ERegister } from "@/components/wxproducts/eregister";

export const metadata: Metadata = {
  title: "Weather Electronic Register (Hourly)",
  description:
    "Meteorological observations register for Maurice Bishop International Airport — station 78958.",
};

export default function HourlyPage() {
  return (
    <WideContent className="space-y-5">
      <ERegister />
    </WideContent>
  );
}
