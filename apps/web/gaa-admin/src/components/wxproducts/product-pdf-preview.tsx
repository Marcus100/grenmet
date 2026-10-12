"use client";
import {
  displayProductFields,
  isComposedForecastField,
  isForecastKind,
  type ProductContent,
  productTitle,
} from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Download } from "lucide-react";
import { type ReactNode, useState } from "react";
import { downloadProductPdfAction } from "@/app/(admin)/wxproducts/product-actions";
import {
  ForecastPdfFrame,
  type PdfPreviewRequest,
} from "@/components/wxproducts/forecast-pdf-frame";
import { productFieldLabel, productFieldValue } from "@/lib/wxproducts/units";

const DAY_SUBSECTION = /^Day [1-4] · /;

/**
 * Document preview for every weather product: FastAPI renders the draft with the
 * issued layout, and saved/published revisions download as the same PDF.
 */
export function ProductPdfPreview({
  content,
  saved,
  dirty = false,
  request,
  expanded,
  onExpandedChange,
  onPreview,
  busy = false,
}: {
  content: ProductContent;
  saved?: { id: string; revision: number; publishedRevision: number | null };
  dirty?: boolean;
  request: PdfPreviewRequest | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onPreview: () => void;
  busy?: boolean;
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
        disabled={busy}
        onClick={onPreview}
        type="button"
        variant="outline"
      >
        Preview PDF
      </Button>
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
  let narrativeKey = isForecastKind(content.kind) ? "summary" : "synopsis";
  if (content.kind === "outlook") narrativeKey = "systems";
  const basicFields = [
    ["Issued (Grenada time)", content.values.issuedAt?.replace("T", " ")],
    ["Valid from (Grenada time)", content.values.validFrom?.replace("T", " ")],
    ["Valid until (Grenada time)", content.values.validTo?.replace("T", " ")],
    ["Forecaster", content.values.forecaster],
  ];
  const systems = content.guidance?.systems ?? [];
  const productFields = displayProductFields(content.kind);
  const fields = productFields.filter((field) => {
    if (
      content.kind === "outlook" &&
      systems.length &&
      ["formationChance48h", "formationChance7d"].includes(field.key)
    )
      return false;
    if (
      [
        "issuedAt",
        "validFrom",
        "validTo",
        "forecaster",
        "advisories",
        narrativeKey,
      ].includes(field.key)
    )
      return false;
    if (!content.values[field.key]?.trim()) return false;
    // Display entered structured values instead of a previously composed summary.
    if (isComposedForecastField(field.key)) {
      const structured = productFields.some(
        (candidate) =>
          candidate.section === field.section &&
          (candidate.options ||
            candidate.type === "number" ||
            candidate.type === "time") &&
          content.values[candidate.key]?.trim()
      );
      if (structured) return false;
    }
    return true;
  });
  const sections = [...new Set(fields.map((field) => field.section))];
  return (
    <section
      aria-label="Product summary"
      className="space-y-4 rounded-xl border bg-card p-4"
    >
      <div className="space-y-2">
        <h2 className="font-semibold text-lg leading-6">
          {productTitle(content.kind)}
        </h2>
        <p className="text-muted-foreground text-xs">
          Live summary · Grenada time (UTC−04:00)
        </p>
        <div className="flex flex-wrap gap-2">{actions}</div>
        {description ? (
          <div className="text-muted-foreground text-xs">{description}</div>
        ) : null}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {basicFields.map(([label, value]) => (
          <div key={label}>
            <dt className="font-medium text-muted-foreground text-xs">
              {label}
            </dt>
            <dd className="break-words text-sm tabular-nums leading-5">
              {value?.trim() || "Not entered"}
            </dd>
          </div>
        ))}
      </dl>
      {systems.length
        ? systems.map((system) => (
            <section
              aria-label={`${system.name || "Unnamed system"} summary`}
              className="space-y-2 border-t pt-3"
              key={system.id}
            >
              <h3 className="font-medium text-sm">
                {system.name || "Unnamed system"}
              </h3>
              <p className="whitespace-pre-wrap break-words text-sm">
                {system.narrative || "Not entered"}
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                {(system.facts ?? [])
                  .filter((fact) => fact.key === "formation_probability")
                  .map((fact, index) => (
                    <div key={fact.id ?? `${fact.horizon_hours}-${index}`}>
                      <dt className="text-muted-foreground text-xs">
                        Formation probability
                        {fact.horizon_hours ? ` (${fact.horizon_hours} h)` : ""}
                      </dt>
                      <dd className="text-sm">
                        {fact.description ||
                          fact.qualifier ||
                          (fact.value !== null && fact.value !== undefined
                            ? `${fact.value}%`
                            : "Not entered")}
                      </dd>
                    </div>
                  ))}
              </dl>
              {system.local_assessment ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  {system.local_assessment}
                </p>
              ) : null}
            </section>
          ))
        : null}
      {content.guidance?.local_assessment ? (
        <p className="whitespace-pre-wrap break-words text-sm">
          {content.guidance.local_assessment}
        </p>
      ) : null}
      <div>
        <h3 className="text-muted-foreground text-xs">Summary</h3>
        <p className="whitespace-pre-wrap break-words text-sm">
          {content.values[narrativeKey]?.trim() || "Not entered"}
        </p>
      </div>
      {sections.map((section) => (
        <section
          aria-label={`${section} summary`}
          className="space-y-3 border-t pt-3"
          key={section}
        >
          <h3 className="font-semibold text-sm leading-5">
            {section.replace(DAY_SUBSECTION, "")}
          </h3>
          <dl className="grid gap-3 sm:grid-cols-2">
            {fields
              .filter((field) => field.section === section)
              .map((field) => (
                <div
                  className={
                    field.type === "textarea" ? "sm:col-span-2" : undefined
                  }
                  key={field.key}
                >
                  <dt className="font-medium text-muted-foreground text-xs">
                    {productFieldLabel(field)}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words text-sm tabular-nums leading-5">
                    {field.type === "datetime-local"
                      ? content.values[field.key]?.replace("T", " ")
                      : productFieldValue(field, content.values[field.key])}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
      <ForecastPdfFrame
        content={content}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        onRetry={onPreview}
        request={request}
      />
    </section>
  );
}
