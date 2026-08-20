"use server";

import { saveMorningForecast, suiteExists } from "@/db/wxproducts/queries";
import { morningProductSchema } from "@/db/wxproducts/schema/morning";
import { readSessionCookie } from "@/lib/server-session";

export type SaveForecastResult =
  | { error: string; status: "error" }
  | { productId: string; status: "saved" };

/**
 * Persists a morning forecast from the editor.
 *
 * A thin wrapper over `saveMorningForecast`: the database work and its field
 * mapping stay in plain functions that can be exercised without a request, so
 * this layer only does what a request boundary must — authenticate, validate,
 * and turn failures into something the form can show.
 */
export async function saveMorningForecastAction(
  input: unknown,
  suiteId: string
): Promise<SaveForecastResult> {
  // Writes reach the wxproducts database directly, so this cannot rely on the
  // route layout's guard: a server action is its own entry point.
  const sessionToken = await readSessionCookie();
  if (!sessionToken) {
    return {
      error: "Your session has expired — sign in again",
      status: "error",
    };
  }

  const parsed = morningProductSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: first
        ? `${first.path.join(".") || "form"}: ${first.message}`
        : "The forecast is not valid",
      status: "error",
    };
  }

  // Checked before writing so a missing suite reads as a decision that has not
  // been made, rather than surfacing as a raw foreign-key violation.
  if (!(await suiteExists(suiteId))) {
    return {
      error: `No product suite "${suiteId}" exists yet — create the daily suite before issuing forecasts`,
      status: "error",
    };
  }

  try {
    const { productId } = await saveMorningForecast(parsed.data, suiteId);
    return { productId, status: "saved" };
  } catch {
    return { error: "Could not save the forecast", status: "error" };
  }
}
