/**
 * Builds a storable morning-forecast product from the editor's flat form.
 *
 * This is where the issuing conventions agreed for GMS live: how a product is
 * identified, how a reissue is versioned, and what window a morning forecast
 * covers. They are constants rather than editor fields because a forecaster
 * should not be retyping them every morning.
 */

import type { ForecastValues } from "@/components/wxproducts/forecast-document";
import {
  buildSunMoon,
  buildTemperature,
  buildTides,
  parseWind,
} from "@/db/wxproducts/forecast-parsing";
import type { ElementsBlock } from "@/db/wxproducts/schema/elements";
import type { MorningForecastProduct } from "@/db/wxproducts/schema/morning";
import type {
  ProductStatus,
  Versioning,
} from "@/db/wxproducts/schema/product-metadata";

/** A morning forecast always covers today and tonight, 6am to 6am. */
const VALID_DURATION_HOURS = 24;
const VALID_FROM_TIME = "06:00";

export const MORNING_PRODUCT_PREFIX = "GMS-MORNING";

/** "No Weather-related Alert" and similar defaults are not advisories. */
const NO_ALERT = /^no\b.*alert$/i;

/** One forecast per type per day: a reissue replaces the same record. */
export function morningProductId(issueDate: string): string {
  return `${MORNING_PRODUCT_PREFIX}-${issueDate}`;
}

/**
 * The daily suite every product issued that day belongs to. The
 * `GMS-DAILY-SUITE-` prefix matches the identifiers already in the product
 * data, so generated suites sit alongside existing ones rather than forming a
 * second naming scheme.
 */
export function dailySuiteId(issueDate: string): string {
  return `GMS-DAILY-SUITE-${issueDate}`;
}

export interface ReissueContext {
  /** Why the forecast was reissued, shown against the stored version. */
  changeSummary?: string | null;
  /** True when correcting an error, as opposed to a routine update. */
  isCorrection?: boolean;
  /** Version of the forecast being replaced, when one exists. */
  previousVersion?: number | null;
  /**
   * `draft` is saved but not issued and must not reach a public surface;
   * `operational` is published. Defaults to draft so a forecast is never
   * published by a caller that forgot to say so.
   */
  status?: ProductStatus;
}

function buildVersioning(
  productId: string,
  reissue: ReissueContext
): Versioning {
  const previous = reissue.previousVersion ?? null;
  return {
    change_summary: reissue.changeSummary ?? null,
    is_correction: reissue.isCorrection ?? false,
    // A first issue replaces nothing; a reissue names the record it supersedes,
    // which is the same id because one record is kept per period.
    replaces_product_id: previous === null ? null : productId,
    revision: 0,
    version: (previous ?? 0) + 1,
  };
}

function buildElements(values: ForecastValues): ElementsBlock {
  const elements: ElementsBlock = {};

  const wind = parseWind(values.windSpeed, values.windDirection);
  if (wind) {
    elements.wind = wind;
  }
  const temperature = buildTemperature(
    values.maxTemperature,
    values.minTemperature
  );
  if (temperature) {
    elements.temperature = temperature;
  }
  const tides = buildTides(values.highTide, values.lowTide);
  if (tides) {
    elements.tides = tides;
  }
  const sunMoon = buildSunMoon(values.sunrise, values.sunset);
  if (sunMoon) {
    elements.sun_moon = sunMoon;
  }
  if (values.summary.trim()) {
    elements.weather = { text: values.summary.trim() };
  }
  if (values.seaState.trim()) {
    elements.seas = { text: values.seaState.trim() };
  }

  return elements;
}

/** Advisory lines the forecaster entered, with the placeholders dropped. */
function buildAdvisories(values: ForecastValues): string[] {
  return [values.wxWarning, values.windWarning, values.marineWarning]
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !NO_ALERT.test(line));
}

export function buildMorningProduct(
  values: ForecastValues,
  issuedAt: Date,
  reissue: ReissueContext = {}
): MorningForecastProduct {
  const issueDate = values.dateIssued || issuedAt.toISOString().slice(0, 10);
  const productId = morningProductId(issueDate);
  const advisories = buildAdvisories(values);

  return {
    forecast: {
      elements: buildElements(values),
      headline: values.summary.trim() || values.validity,
      product_notes:
        advisories.length > 0 ? { advisories_text: advisories } : null,
    },
    links: {
      cap_bundle_id: null,
      ibf_assessment_id: null,
    },
    product_metadata: {
      forecaster: { name: values.forecasterName },
      geography: { area_name: values.location },
      issue_datetime_local: issuedAt.toISOString(),
      issue_datetime_utc: issuedAt.toISOString(),
      language: "en",
      product_channel: ["website"],
      product_id: productId,
      product_type: "morning_forecast",
      status: reissue.status ?? "draft",
      validity: {
        valid_duration_hours: VALID_DURATION_HOURS,
        valid_from_local: `${issueDate}T${VALID_FROM_TIME}:00`,
        valid_to_local: `${nextDay(issueDate)}T${VALID_FROM_TIME}:00`,
        validity_text: values.validity,
      },
      versioning: buildVersioning(productId, reissue),
    },
  };
}

function nextDay(isoDate: string): string {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
