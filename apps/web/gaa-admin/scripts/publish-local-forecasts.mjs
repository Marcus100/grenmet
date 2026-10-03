import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  emptyProduct,
  grenadaDate,
  localDateTime,
} from "../../../../packages/gms/src/products.ts";

/** Historical September 10 reports, redated for LOCAL testing, with a synthetic fourth day. */
export function localForecasts(date) {
  const common = {
    wind: "ENE–ESE, 13–23 mph, gusting higher with showers",
    seaState: "Moderate, waves 5–7 ft in open waters",
    sunrise: "05:56",
    sunset: "18:11",
    word: "CLOUDY",
    definition:
      "More than half of the sky covered with low and/or medium level clouds for more than 80% of the forecast period.",
  };
  const reports = [
    {
      kind: "morning",
      values: {
        ...emptyProduct("morning", date),
        ...common,
        forecaster:
          "LOCAL TEST — adapted from Nicole Jones’s 10 September report",
        summary:
          "LOCAL TEST — historical weather, not an operational forecast. Partly cloudy to cloudy and windy, with light to moderate showers and possible isolated thunder, improving as the day progresses.",
        maxTemperature: "31.5",
        minTemperature: "26.0",
        highTides: "09:15",
        lowTides: "15:45",
      },
    },
    {
      kind: "midday",
      values: {
        ...emptyProduct("midday", date),
        ...common,
        forecaster:
          "LOCAL TEST — adapted from Nicole Jones’s 10 September report",
        summary:
          "LOCAL TEST — historical weather, not an operational forecast. Partly cloudy to cloudy and windy, with light to moderate showers and thunder, improving by late evening.",
        maxTemperature: "31.5",
        minTemperature: "24.5",
        observedTemperature: "25.9",
        highTides: "21:00",
        lowTides: "15:15",
      },
    },
    {
      kind: "evening",
      values: {
        ...emptyProduct("evening", date),
        forecaster:
          "LOCAL TEST — adapted from Vondi Cyrus’s 10 September report; fourth day invented",
        summary:
          "LOCAL TEST — historical weather, not an operational forecast. Partly cloudy to cloudy and breezy, with a few brief showers.",
        minTemperature: "25.0",
        wind: "ENE–ESE, 13–23 mph",
        seaState: "Moderate, waves 4–6 ft in open waters",
        highTides: "21:00",
        lowTides: "15:00",
      },
    },
  ];
  const future = [
    [
      "Partly cloudy, hazy and windy, with light to moderate showers, increasing in cloudiness and showers at times overnight.",
      "32.0",
      "25.5",
      "ENE–ESE, 14–24 mph",
      "Moderate, waves 5–7 ft in open waters",
      "18:10",
    ],
    [
      "Partly cloudy to cloudy and breezy, with light to moderate showers and a low chance of isolated thunder.",
      "31.5",
      "25.0",
      "ENE–ESE, 12–22 mph, gusting higher with showers",
      "Moderate, waves 4–6 ft in open waters",
      "18:10",
    ],
    [
      "Partly cloudy to cloudy with light to moderate showers and a low chance of thunder, improving as the day progresses.",
      "31.5",
      "25.5",
      "ENE–ESE, 12–22 mph",
      "Slight to moderate, waves 3–5 ft in open waters",
      "18:09",
    ],
    [
      "INVENTED LOCAL TEST DAY — Partly cloudy with a few brief showers and sunny intervals.",
      "32.0",
      "25.0",
      "ENE–ESE, 12–20 mph",
      "Slight to moderate, waves 3–5 ft in open waters",
      "18:08",
    ],
  ];
  future.forEach(([weather, max, min, wind, seas, sunset], i) => {
    const prefix = `day${i + 1}`;
    Object.assign(reports[2].values, {
      [`${prefix}Weather`]: `LOCAL TEST — ${weather}`,
      [`${prefix}Max`]: max,
      [`${prefix}Min`]: min,
      [`${prefix}Wind`]: wind,
      [`${prefix}SeaState`]: seas,
      [`${prefix}Sunrise`]: "05:56",
      [`${prefix}Sunset`]: sunset,
    });
  });
  return reports;
}

async function main() {
  const date =
    process.argv.find((arg) => arg.startsWith("--date="))?.slice(7) ??
    grenadaDate();
  if (!Number.isFinite(localDateTime(`${date}T07:00`)))
    throw new Error("Invalid date");
  const reports = localForecasts(date);
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("Local tests only");
  await publishLocalForecasts(date, {
    baseUrl: process.env.AUTH_API_URL ?? "http://localhost:8000",
    accessToken: process.env.WXPRODUCTS_ACCESS_TOKEN,
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();

/** Local fixture publications use the same authorization and validation as the editor. */
export async function publishLocalForecasts(date, { baseUrl, accessToken }) {
  const base = new URL(baseUrl);
  if (
    base.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "host.docker.internal"].includes(base.hostname)
  )
    throw new Error("Expected a local FastAPI URL");
  if (!accessToken)
    throw new Error(
      "WXPRODUCTS_ACCESS_TOKEN is required for an authorized local author"
    );
  for (const report of localForecasts(date)) {
    const hex = createHash("sha256")
      .update(`local-forecast-v1:${date}:${report.kind}`)
      .digest("hex");
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    const query = new URLSearchParams({ kind: report.kind, issue_date: date });
    const existing = await fetch(
      new URL(`/api/v1/wxproducts/products?${query}`, base),
      {
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!existing.ok)
      throw new Error(`Could not read local products (${existing.status})`);
    const { products } = await existing.json();
    if (products.some((product) => product.id === id)) continue;
    const previewResponse = await fetch(
      new URL("/api/v1/wxproducts/products/preview", base),
      {
        method: "POST",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          ...report,
          expectedRevision: 0,
          changeSummary: "",
        }),
      }
    );
    if (!previewResponse.ok)
      throw new Error(`Local validation rejected (${previewResponse.status})`);
    const preview = await previewResponse.json();
    if (
      !(Array.isArray(preview.errors) && preview.values) ||
      typeof preview.values !== "object" ||
      Array.isArray(preview.values)
    )
      throw new Error("Invalid FastAPI preview response");
    if (preview.errors.length)
      throw new Error(
        `Local validation rejected: ${preview.errors.join("; ")}`
      );
    const response = await fetch(new URL("/api/v1/wxproducts/products", base), {
      method: "POST",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        ...report,
        values: preview.values,
        id,
        expectedRevision: 0,
        action: "publish",
        reviewed: true,
        changeSummary:
          "Local test: historical PDF weather redated; fourth evening day invented.",
      }),
    });
    if (!response.ok)
      throw new Error(`Local publication rejected (${response.status})`);
    console.log(`${report.kind}: published ${id}`);
  }
}
