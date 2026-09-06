import type { Metadata } from "next";
import { ERegister } from "@/components/wxproducts/eregister";

export const metadata: Metadata = {
  title: "eRegister (Hourly)",
  description:
    "Meteorological observations register for Maurice Bishop International Airport — station 78958.",
};

export default function HourlyPage() {
  return <ERegister />;
}
