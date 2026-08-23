"use server";

import type { ForecastValues } from "@/components/wxproducts/forecast-document";
import {
  buildMorningProduct,
  dailySuiteId,
  morningProductId,
} from "@/db/wxproducts/morning-assembly";
import {
  ensureDailySuite,
  getStoredVersion,
  saveMorningForecast,
} from "@/db/wxproducts/queries";
import { morningProductSchema } from "@/db/wxproducts/schema/morning";
import { buildDailySuite } from "@/db/wxproducts/suite-assembly";
import { readSessionCookie } from "@/lib/server-session";

export type SaveForecastResult =
  | { error: string; status: "error" }
  | {
      productId: string;
      published: boolean;
      status: "saved";
      version: number;
    };

export interface SaveForecastInput {
  /** Why this reissue was made; recorded against the stored version. */
  changeSummary?: string | null;
  /** True when correcting an error rather than routinely updating. */
  isCorrection?: boolean;
  /**
   * `false` saves a draft the forecaster can come back to; `true` issues the
   * forecast. Defaults to a draft, so publishing is always a deliberate act.
   */
  publish?: boolean;
  values: ForecastValues;
}

/** Midday follows the morning forecast; the suite records when to expect it. */
const HOURS_TO_NEXT_UPDATE = 6;

/**
 * Persists a morning forecast from the editor.
 *
 * Assembly, versioning and storage stay in plain functions that run without a
 * request, so this layer only does what a request boundary must: authenticate,
 * decide whether this is a first issue or a reissue, and turn failures into
 * something the form can show.
 */
export async function saveMorningForecastAction(
  input: SaveForecastInput
): Promise<SaveForecastResult> {
  // A server action is its own entry point: it cannot rely on the route
  // layout's guard, and it writes to the database directly.
  const sessionToken = await readSessionCookie();
  if (!sessionToken) {
    return {
      error: "Your session has expired — sign in again",
      status: "error",
    };
  }

  const { values } = input;
  if (!values.forecasterName.trim()) {
    return {
      error: "Add the forecaster's name before saving",
      status: "error",
    };
  }

  const issuedAt = new Date();
  const issueDate = values.dateIssued || issuedAt.toISOString().slice(0, 10);
  const suiteId = dailySuiteId(issueDate);

  try {
    const nextUpdate = new Date(
      issuedAt.getTime() + HOURS_TO_NEXT_UPDATE * 60 * 60 * 1000
    );
    await ensureDailySuite(
      suiteId,
      buildDailySuite(suiteId, issuedAt, nextUpdate),
      issuedAt
    );

    // Read the stored version first so a reissue increments rather than
    // restarting at 1 and losing the fact that the forecast was amended.
    const previousVersion = await getStoredVersion(morningProductId(issueDate));

    const published = input.publish === true;
    const product = buildMorningProduct(values, issuedAt, {
      changeSummary: input.changeSummary ?? null,
      isCorrection: input.isCorrection ?? false,
      previousVersion,
      status: published ? "operational" : "draft",
    });

    // The form is free text and the parsers are lenient, so the assembled
    // product is checked before it reaches the database rather than trusting
    // that every field survived parsing in a storable shape.
    const parsed = morningProductSchema.safeParse(product);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        error: first
          ? `${first.path.join(".") || "forecast"}: ${first.message}`
          : "The forecast is not valid",
        status: "error",
      };
    }

    const { productId } = await saveMorningForecast(parsed.data, suiteId);
    return {
      productId,
      published,
      status: "saved",
      version: product.product_metadata.versioning.version,
    };
  } catch {
    return { error: "Could not save the forecast", status: "error" };
  }
}
