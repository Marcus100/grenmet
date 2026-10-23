import type { Metadata } from "next";
import { ShiftExchangeEditor } from "@/components/hr/shift/shift-exchange-editor";
import { ShiftSwapSubmissions } from "@/components/hr/shift/shift-swap-submissions";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Shift Exchange",
  description: "Shift exchange requisition — edit and preview",
};

export default function ShiftExchangePage() {
  return (
    <div className="@container space-y-6">
      <PageHeader
        description="Fill in the form to preview the document, then print or export."
        title="Shift Exchange Requisition"
      />
      <ShiftExchangeEditor />
      <ShiftSwapSubmissions />
    </div>
  );
}
