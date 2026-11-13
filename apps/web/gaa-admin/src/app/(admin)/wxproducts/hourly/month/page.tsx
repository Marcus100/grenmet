import type { Metadata } from "next";
import { WideContent } from "@/components/layout/wide-content";
import {
  parseWorkbookSearch,
  type WorkbookSearch,
} from "@/components/wxproducts/eregister-month";
import { MonthWorkbook } from "@/components/wxproducts/eregister-month-view";

export const metadata: Metadata = {
  title: "eRegister month workbook",
  description:
    "Every hour of a register month for station 78958, with review, filters and export.",
};

export default async function MonthWorkbookPage({
  searchParams,
}: {
  searchParams: Promise<WorkbookSearch>;
}) {
  const { month, day, filters } = parseWorkbookSearch(await searchParams);
  return (
    <WideContent className="space-y-5">
      <MonthWorkbook day={day} filters={filters} month={month} />
    </WideContent>
  );
}
