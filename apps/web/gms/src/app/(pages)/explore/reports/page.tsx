import { News } from "@/components/news";
export const dynamic = "force-dynamic";
export const metadata = { title: "Latest reports" };
/** Write-ups of issued reports; each links to its report in FastAPI. */
export default function ReportsPage() {
  return (
    <News
      collection="report-notes"
      noun="report write-ups"
      title="Latest reports"
    />
  );
}
