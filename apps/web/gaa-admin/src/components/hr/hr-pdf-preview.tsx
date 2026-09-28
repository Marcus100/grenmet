"use client";

import { useEffect, useRef, useState } from "react";
import { reportError } from "@/lib/report-error";
import { hrApiErrorMessage } from "./api-error";

const PREVIEW_DELAY_MS = 750;

async function fetchHrPdf({
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

/** The same FastAPI PDF renderer serves an editable draft and its signed copy. */
export function HrPdfPreview({
  payload,
  previewPath,
  ready,
  signedDocumentId,
  title,
}: {
  payload: Record<string, unknown>;
  previewPath: string;
  ready: boolean;
  signedDocumentId?: string | null;
  title: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const currentUrl = useRef<string | null>(null);
  const key = JSON.stringify(payload);

  // The payload object is recreated by form subscriptions; its JSON key changes
  // only when the entered values change.
  useEffect(() => {
    if (!(ready || signedDocumentId)) {
      setRendering(false);
      setError(null);
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
      setUrl(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setRendering(true);
        setError(null);
        try {
          const blob = await fetchHrPdf({
            payload: key,
            previewPath,
            signedDocumentId,
            signal: controller.signal,
          });
          const nextUrl = URL.createObjectURL(blob);
          if (controller.signal.aborted) {
            URL.revokeObjectURL(nextUrl);
            return;
          }
          if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
          currentUrl.current = nextUrl;
          setUrl(nextUrl);
        } catch (caught) {
          if (!controller.signal.aborted) {
            reportError(caught, "hr-pdf-preview");
            if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
            currentUrl.current = null;
            setUrl(null);
            setError(
              caught instanceof Error ? caught.message : "Preview unavailable"
            );
          }
        } finally {
          if (!controller.signal.aborted) setRendering(false);
        }
      },
      signedDocumentId ? 0 : PREVIEW_DELAY_MS
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key, previewPath, ready, signedDocumentId]);

  useEffect(
    () => () => {
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    },
    []
  );

  let statusText = "Enter the required dates to preview the form.";
  if (signedDocumentId) statusText = "Signed document";
  else if (ready) statusText = "Draft preview · Save or submit to keep a copy";
  if (rendering) statusText = "Updating preview…";
  if (error) statusText = error;

  return (
    <div className="flex flex-col rounded-xl border bg-card">
      <div className="px-4 py-4">
        <h2 className="font-medium text-lg">{title} PDF preview</h2>
        <p aria-live="polite" className="text-muted-foreground text-xs">
          {statusText}
        </p>
      </div>
      <div className="rounded-b-xl bg-muted p-3">
        {url ? (
          <iframe
            className="aspect-[210/297] w-full rounded-sm bg-white shadow-sm"
            src={`${url}#toolbar=0&navpanes=0&view=FitH`}
            title={`${title} PDF preview`}
          />
        ) : (
          <div className="grid aspect-[210/297] w-full place-items-center rounded-sm bg-white text-muted-foreground text-sm">
            {error ? "Preview unavailable" : "Rendering preview…"}
          </div>
        )}
      </div>
    </div>
  );
}
