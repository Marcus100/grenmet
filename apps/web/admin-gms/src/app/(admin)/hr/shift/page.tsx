import type { Metadata } from "next";
import { ShiftExchangeEditor } from "@/components/hr/shift/shift-exchange-editor";
import { ShiftSwapSubmissions } from "@/components/hr/shift/shift-swap-submissions";

export const metadata: Metadata = {
  title: "Shift Exchange",
  description: "Shift exchange requisition — edit and preview",
};

export default function ShiftExchangePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Shift Exchange Requisition
        </h1>
        <p className="text-muted-foreground text-sm">
          Fill in the form to preview the document, then print or export.
        </p>
      </div>
      <ShiftExchangeEditor />
      <ShiftSwapSubmissions />
    </div>
  );
}
