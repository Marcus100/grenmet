"use client";
import type { ProductContent } from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Download } from "lucide-react";
import { type ReactNode, useState } from "react";
import { downloadProductPdfAction } from "@/app/(admin)/wxproducts/product-actions";
import { ForecastPdfFrame } from "@/components/wxproducts/forecast-pdf-frame";

/**
 * Document preview for every weather product: FastAPI renders the draft with the
 * issued layout, and saved/published revisions download as the same PDF.
 */
export function ProductPdfPreview({
  content,
  saved,
  dirty = false,
}: {
  content: ProductContent;
  saved?: { id: string; revision: number; publishedRevision: number | null };
  dirty?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  async function download(revision: number) {
    if (!saved) return;
    setDownloading(true);
    setError("");
    try {
      const result = await downloadProductPdfAction(saved.id, revision);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `gms-${content.kind}-${saved.id}-r${revision}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError("Could not download this saved revision. Try again.");
    } finally {
      setDownloading(false);
    }
  }
  let description: ReactNode = null;
  if (error) description = <span role="alert">{error}</span>;
  else if (dirty || !saved?.revision)
    description = "Save draft to download these changes.";
  const actions = (
    <>
      <Button
        aria-label="Download saved revision PDF"
        disabled={!saved?.revision || dirty || downloading}
        onClick={() => saved && download(saved.revision)}
        title="Download saved revision PDF"
        type="button"
        variant="outline"
      >
        <Download data-icon="inline-start" />
        PDF
      </Button>
      {saved?.publishedRevision &&
      saved.publishedRevision !== saved.revision ? (
        <Button
          aria-label={`Published r${saved.publishedRevision}: download PDF`}
          disabled={downloading}
          onClick={() =>
            saved.publishedRevision && download(saved.publishedRevision)
          }
          title={`Download published revision ${saved.publishedRevision} PDF`}
          type="button"
          variant="outline"
        >
          <Download data-icon="inline-start" />
          Published r{saved.publishedRevision}
        </Button>
      ) : null}
    </>
  );
  return (
    <ForecastPdfFrame
      actions={actions}
      content={content}
      description={description}
      expectedRevision={saved?.revision ?? 0}
    />
  );
}
