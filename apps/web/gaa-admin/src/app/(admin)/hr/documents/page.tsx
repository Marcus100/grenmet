import type { Metadata } from "next";
import { DocumentWorkspace } from "@/components/hr/documents/document-workspace";
import { RecordsTabs } from "@/components/hr/records-tabs";

export const metadata: Metadata = { title: "Employee Documents | GAA" };

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <RecordsTabs />
      <div className="space-y-2">
        <h1 className="font-medium text-3xl">Employee documents</h1>
        <p className="text-muted-foreground">
          Find personnel records and work credentials within your assigned
          access.
        </p>
      </div>
      <DocumentWorkspace />
    </div>
  );
}
