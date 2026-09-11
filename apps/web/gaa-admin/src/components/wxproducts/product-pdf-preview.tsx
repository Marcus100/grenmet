"use client";
import { type ProductContent, productTitle } from "@barrelsgd/gms/products";
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
export function ProductPdfPreview({ content }: { content: ProductContent }) {
  const original = originalDocument(content);
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
    <DocumentPreview continuous title="PDF preview">
      {document}
    </DocumentPreview>
  );
}
