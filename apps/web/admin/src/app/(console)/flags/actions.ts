"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  collectValues,
  type FlagFormState,
  type FlagNoticeCode,
  parseFlagCreate,
  parseFlagId,
  parseFlagUpdate,
} from "@/lib/flag-form";
import { createFlag, deleteFlag, getFlag, updateFlag } from "@/lib/flags-api";
import { reportError } from "@/lib/report-error";
import { requireGate } from "@/lib/staff-gate";

// Validate, proxy to FastAPI (which owns the success-metric rule and the flag
// cache) and either redirect with a fixed notice code or, for a rejected form,
// return the API's message to the form so nothing is reflected from a URL.

const SERVER_ERROR = 500;
const UNPROCESSABLE = 422;
const CONFLICT = 409;
const NOT_FOUND = 404;
const MAX_MESSAGE = 300;
const JSON_START = /^[[{]/u;

async function staffToken(): Promise<string> {
  const gate = await requireGate("/flags");
  if (gate.status !== "staff") redirect("/");
  return gate.accessToken;
}

function done(code: FlagNoticeCode): never {
  revalidatePath("/flags");
  redirect(`/flags?notice=${code}`);
}

/** A readable message for a rejected save. Plain-text details only. */
function rejection(error: { detail: string; status: number }): string {
  if (error.status === CONFLICT) {
    return "That flag key is already in use. Keys are unique and permanent.";
  }
  if (error.status === UNPROCESSABLE) {
    const detail = error.detail.trim();
    return detail && !JSON_START.test(detail) && detail.length <= MAX_MESSAGE
      ? detail
      : "The API did not accept those values. Check the fields and try again.";
  }
  return "The flag change could not be saved. Nothing was changed.";
}

function invalid(formData: FormData): FlagFormState {
  return {
    message:
      "Check the fields: the key, audience ids, percentage or dates are not valid.",
    values: collectValues(formData),
  };
}

/** Create or patch. Returns a form state when the input is not acceptable. */
async function submit(
  token: string,
  flagId: string | undefined,
  formData: FormData
): Promise<FlagFormState | undefined> {
  if (!flagId) {
    const parsed = parseFlagCreate(formData);
    if (!parsed.ok) return invalid(formData);
    await createFlag(token, parsed.value);
    return;
  }
  const parsed = parseFlagUpdate(formData, await getFlag(token, flagId));
  if (!parsed.ok) return invalid(formData);
  if (Object.keys(parsed.value).length === 0) done("flag-unchanged");
  await updateFlag(token, flagId, parsed.value);
}

export async function saveFlagAction(
  _previous: FlagFormState,
  formData: FormData
): Promise<FlagFormState> {
  const token = await staffToken();
  const rawId = String(formData.get("flag_id") ?? "");
  const flagId = rawId ? parseFlagId(rawId) : undefined;
  if (rawId && !flagId) return invalid(formData);

  try {
    const problem = await submit(token, flagId, formData);
    if (problem) return problem;
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    if (error.status === NOT_FOUND) done("flag-missing");
    if (error.status >= SERVER_ERROR) reportError(error, "admin-flags");
    return { message: rejection(error), values: collectValues(formData) };
  }
  return done(flagId ? "flag-updated" : "flag-created");
}

export async function deleteFlagAction(formData: FormData): Promise<never> {
  const token = await staffToken();
  const flagId = parseFlagId(String(formData.get("flag_id") ?? ""));
  if (!flagId) return done("flag-missing");
  try {
    await deleteFlag(token, flagId);
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    if (error.status === NOT_FOUND) return done("flag-missing");
    reportError(error, "admin-flags");
    return done("flag-failed");
  }
  return done("flag-deleted");
}
