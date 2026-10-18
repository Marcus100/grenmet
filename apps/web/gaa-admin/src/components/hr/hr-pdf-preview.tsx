"use client";

import { useMemo } from "react";
import { DocumentPreview } from "@/components/document/document-preview";
import { hrApiErrorMessage } from "./api-error";

export async function fetchHrPdf({
  payload,
  previewPath,
  signedDocumentId,
  signal,
}: {
  payload: string;
  previewPath: string;
  signedDocumentId?: string | null;
  signal?: AbortSignal;
}): Promise<Blob> {
  const response = await fetch(
    signedDocumentId
      ? `/api/v1/hr/signed-documents/${signedDocumentId}/pdf`
      : previewPath,
    {
      method: signedDocumentId ? "GET" : "POST",
      body: signedDocumentId ? undefined : payload,
      headers: signedDocumentId
        ? undefined
        : { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal,
    }
  );
  if (!response.ok) {
    const detail: unknown = await response.json().catch(() => null);
    throw Object.assign(
      new Error(
        detail
          ? hrApiErrorMessage(detail)
          : "The PDF could not be rendered. Check the form fields and try again."
      ),
      { status: response.status }
    );
  }
  if (!response.headers.get("content-type")?.startsWith("application/pdf")) {
    throw new Error("The server returned an invalid PDF response.");
  }
  return response.blob();
}

/** Download the Python-rendered document rather than printing the editor page. */
export async function downloadHrPdf({
  payload,
  previewPath,
  signedDocumentId,
  filename,
}: {
  payload: Record<string, unknown>;
  previewPath: string;
  signedDocumentId?: string | null;
  filename: string;
}) {
  const blob = await fetchHrPdf({
    payload: JSON.stringify(payload),
    previewPath,
    signedDocumentId,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The shared document preview wired to the FastAPI PDF renderer. A draft
 * renders only when the user selects Preview; a signed copy renders on its own.
 */
export function HrPdfPreview({
  filename,
  payload,
  previewPath,
  ready,
  signedDocumentId,
  title,
}: {
  filename?: string;
  payload: Record<string, unknown>;
  previewPath: string;
  ready: boolean;
  signedDocumentId?: string | null;
  title: string;
}) {
  // The payload object is recreated by form subscriptions; its JSON key changes
  // only when the entered values change.
  const key = JSON.stringify(payload);
  const pdf = useMemo(
    () => ({
      filename: filename ?? `${title.toLowerCase().replaceAll(" ", "-")}.pdf`,
      render: (signal: AbortSignal) =>
        fetchHrPdf({ payload: key, previewPath, signedDocumentId, signal }),
    }),
    [filename, key, previewPath, signedDocumentId, title]
  );
  return (
    <DocumentPreview
      autoRender={Boolean(signedDocumentId)}
      description={
        signedDocumentId
          ? "Signed document"
          : "Draft preview. Save or submit to keep a copy."
      }
      emptyHint="Enter the required fields to enable the preview."
      errorArea="hr-pdf-preview"
      inputKey={signedDocumentId ?? key}
      pdf={pdf}
      ready={ready || Boolean(signedDocumentId)}
      title={`${title} preview`}
    />
  );
}
