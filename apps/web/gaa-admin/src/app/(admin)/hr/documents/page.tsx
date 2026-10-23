import type { Metadata } from "next";
import { DocumentWorkspace } from "@/components/hr/documents/document-workspace";
import { RecordsTabs } from "@/components/hr/records-tabs";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Employee Documents | GAA" };

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <RecordsTabs />
      <PageHeader
        description="Find personnel records and work credentials within your assigned access."
        title="Employee documents"
      />
      <DocumentWorkspace />
    </div>
  );
}
