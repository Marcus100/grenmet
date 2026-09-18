"use client";
import {
  isForecastKind,
  type ProductContent,
  productTitle,
} from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useState } from "react";
import { downloadProductPdfAction } from "@/app/(admin)/wxproducts/product-actions";
import { DocumentPreview } from "@/components/document/document-preview";
import { Paper } from "@/components/document/paper";
import {
  EMPTY_FORECAST,
  ForecastDocument,
  IBF_LEVELS,
  type IbfLevel,
} from "@/components/wxproducts/forecast-document";
import { MarineBulletinDocument } from "@/components/wxproducts/marine-bulletin-document";
import { visibleProductFields } from "@/lib/wxproducts/visible-fields";

function impactLevel(value: string): IbfLevel {
  return IBF_LEVELS.find((level) => level === value) ?? "Minimal";
}
function originalDocument(content: ProductContent) {
  const v = content.values;
  if (content.kind === "marine")
    return (
      <MarineBulletinDocument
        values={{
          date: v.issuedAt?.slice(0, 10) ?? "",
          time: v.issuedAt?.slice(11) ?? "",
          validity: v.validity ?? "",
          forecasterName: v.forecaster ?? "",
          synopsis: v.synopsis ?? "",
          weather: v.weather ?? "",
          seaState: v.seaState ?? "",
          visibility: v.visibility ?? "",
          wind: v.wind ?? "",
          warningLevel: v.level ?? "",
          notice: v.notice ?? "",
          tideHigh1: v.highTides ?? "",
          tideHigh2: "",
          tideLow: v.lowTides ?? "",
          sunrise: v.sunrise ?? "",
          sunset: v.sunset ?? "",
        }}
      />
    );
  if (
    content.kind !== "morning" &&
    content.kind !== "midday" &&
    content.kind !== "evening"
  )
    return null;
  return (
    <ForecastDocument
      period={content.kind[0].toUpperCase() + content.kind.slice(1)}
      values={{
        ...EMPTY_FORECAST,
        dateIssued: v.issuedAt?.slice(0, 10) ?? "",
        issueTime: v.issuedAt?.slice(11) ?? "",
        validity: v.validity ?? "",
        location: v.area ?? "",
        forecasterName: v.forecaster ?? "",
        summary: v.summary ?? "",
        maxTemperature: v.maxTemperature ?? "",
        minTemperature: v.minTemperature ?? "",
        wxWarning: v.weatherAlert ?? "",
        windWarning: v.windAlert ?? "",
        marineWarning: v.marineAlert ?? "",
        windDirection: v.wind ?? "",
        windSpeed: "",
        seaState: v.seaState ?? "",
        weatherImpact1: v.weatherImpact ?? "",
        weatherResponse: v.weatherResponse ?? "",
        windImpact1: v.windImpact ?? "",
        windResponse: v.windResponse ?? "",
        marineImpact: v.marineImpact ?? "",
        marineResponse: v.marineResponse ?? "",
        highTide: v.highTides ?? "",
        lowTide: v.lowTides ?? "",
        sunrise: v.sunrise ?? "",
        sunset: v.sunset ?? "",
        likelihood:
          {
            "Very low": "Unlikely",
            Low: "Possible",
            Medium: "Likely",
            High: "Very Likely",
          }[v.likelihood] ?? "Likely",
        ibf: {
          rainfall: impactLevel(v.weatherLevel),
          wind: impactLevel(v.windLevel),
          seas: impactLevel(v.marineLevel),
          heat: impactLevel(v.heatLevel),
          dust: impactLevel(v.dustLevel),
        },
      }}
    />
  );
}
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
  const original = isForecastKind(content.kind)
    ? null
    : originalDocument(content);
  const document = (
    <div className="[&_[data-print-paper]]:h-auto! [&_[data-print-paper]]:min-h-[1056px]">
      {original ? <div className="break-after-page">{original}</div> : null}
      <Paper className="p-10 text-sm">
        <header className="mb-6 border-b pb-4">
          <p className="font-semibold">GRENADA METEOROLOGICAL SERVICE</p>
          <h2 className="font-bold text-xl">{productTitle(content.kind)}</h2>
          <p>{content.values.issuedAt?.replace("T", " ") || "Draft"}</p>
        </header>
        <dl className="space-y-5">
          {visibleProductFields(content.kind).map((field) => (
            <div key={field.key}>
              <dt className="break-after-avoid font-semibold">
                {field.section} · {field.label}
              </dt>
              <dd className="mt-1 whitespace-pre-wrap break-words leading-5">
                {content.values[field.key] || "—"}
              </dd>
            </div>
          ))}
        </dl>
        <footer className="mt-6 border-t pt-3 text-xs">
          Forecaster: {content.values.forecaster || "—"} · Grenada, Carriacou
          and Petite Martinique
        </footer>
      </Paper>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!saved?.revision || dirty || downloading}
          onClick={() => saved && download(saved.revision)}
          type="button"
          variant="outline"
        >
          Download saved revision PDF
        </Button>
        {saved?.publishedRevision &&
        saved.publishedRevision !== saved.revision ? (
          <Button
            disabled={downloading}
            onClick={() =>
              saved.publishedRevision && download(saved.publishedRevision)
            }
            type="button"
            variant="outline"
          >
            Download published revision {saved.publishedRevision}
          </Button>
        ) : null}
      </div>
      {dirty || !saved?.revision ? (
        <p className="text-muted-foreground text-sm">
          Save draft to download these changes.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <DocumentPreview
        continuous
        showDownloadPdf={false}
        title="Document preview"
      >
        {document}
      </DocumentPreview>
    </div>
  );
}
