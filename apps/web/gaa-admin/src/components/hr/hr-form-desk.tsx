"use client";

import type { SignedDocumentPublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { format } from "date-fns";
import { Download, Maximize2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { DeskLayout } from "@/components/document/desk-layout";
import { downloadBlob, PdfDialog } from "@/components/document/pdf-preview";
import { signedDocumentFilename } from "@/lib/pdf-filename";
import { reportError } from "@/lib/report-error";
import { fetchHrPdf } from "./hr-pdf-preview";
import { useSignedDocuments } from "./signatures/signature-api";

/** Signed-document entity types, one per HR form. */
export type HrFormEntity =
  | "absentee_report"
  | "leave_request"
  | "parking_permit"
  | "shift_swap"
  | "status_report"
  | "timesheet";

function SignedCopyRow({
  document: signed,
  label,
}: {
  document: SignedDocumentPublic;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<{ url: string } | null>(null);
  const title = `${label} r${signed.revision ?? 1}`;

  async function load(): Promise<Blob | null> {
    setBusy(true);
    try {
      return await fetchHrPdf({
        payload: "",
        previewPath: "",
        signedDocumentId: signed.id,
      });
    } catch (error) {
      reportError(error, "hr-signed-copy");
      toast.error("Could not load this signed copy. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function expand() {
    const blob = await load();
    if (blob) setViewing({ url: URL.createObjectURL(blob) });
  }

  async function download() {
    const blob = await load();
    if (blob) {
      downloadBlob(
        blob,
        signedDocumentFilename(
          signed.entity_type,
          signed.signer_name,
          signed.signed_at,
          signed.revision ?? 1
        )
      );
    }
  }

  function close() {
    if (viewing) URL.revokeObjectURL(viewing.url);
    setViewing(null);
  }

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="min-w-0">
        <span className="block font-medium">
          Revision {signed.revision ?? 1}
        </span>
        <span className="block text-muted-foreground text-xs">
          Signed {format(new Date(signed.signed_at), "d MMM yyyy, HH:mm")}
        </span>
      </span>
      <span className="flex shrink-0 gap-1">
        <Button
          aria-label={`Expand ${title}`}
          disabled={busy}
          onClick={expand}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Maximize2 />
        </Button>
        <Button
          aria-label={`Download ${title}`}
          disabled={busy}
          onClick={download}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Download />
        </Button>
      </span>
      <PdfDialog
        description={`Signed ${format(new Date(signed.signed_at), "d MMM yyyy, HH:mm")}`}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        open={viewing !== null}
        title={title}
        url={viewing?.url ?? null}
      />
    </li>
  );
}

/** The desk's history card: your signed copies of this form, newest first. */
export function SignedCopies({
  entityType,
  label,
}: {
  entityType: HrFormEntity;
  label: string;
}) {
  // The API narrows the list to this form type before paging.
  const documents = useSignedDocuments(1, entityType);
  const rows = documents.data?.data ?? [];
  let body: ReactNode = (
    <p className="text-muted-foreground text-sm">
      No signed copies yet. Submitted forms appear here.
    </p>
  );
  if (documents.isError) {
    body = (
      <p className="text-destructive text-sm" role="alert">
        Signed copies could not be loaded.
      </p>
    );
  } else if (documents.isPending) {
    body = <p className="text-muted-foreground text-sm">Loading…</p>;
  } else if (rows.length > 0) {
    body = (
      <ul className="space-y-3">
        {rows.map((row) => (
          <SignedCopyRow document={row} key={row.id} label={label} />
        ))}
      </ul>
    );
  }
  return (
    <section aria-label={`${label} signed copies`} className="space-y-3">
      <h2 className="font-medium text-lg">Signed copies</h2>
      {body}
    </section>
  );
}

/** HR forms use the shared desk: editor | preview | signed-copy history. */
export function HrFormDesk({
  editor,
  entityType,
  label,
  preview,
}: {
  editor: ReactNode;
  entityType: HrFormEntity;
  label: string;
  preview: ReactNode;
}) {
  return (
    <DeskLayout
      archive={<SignedCopies entityType={entityType} label={label} />}
      editor={editor}
      preview={preview}
    />
  );
}
