"use server";

// Business settings: profile, services, providers and weekly hours. Every
// action re-checks the session, re-derives the organisation from the person's
// own list by slug (the browser never names an organisation id) and refuses a
// member before any API call. FastAPI still enforces the role. None of these
// routes takes an Idempotency-Key: each is a replace or an addressed update,
// so a repeat is harmless (a repeated create adds a second row, which the
// page shows). Sentry gets the error only, never the form values.

import { ResponseError } from "@barrelsgd/api-client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import { parseHours, parseMoney } from "@/lib/settings-view";
import type { ActionState } from "@/lib/studio-action-state";
import {
  createProvider,
  createService,
  findOrganisation,
  replaceHours,
  saveProfile,
  updateProvider,
  updateService,
} from "@/lib/studio-api";
import {
  SETTINGS_ADMIN_REQUIRED,
  type StudioFailure,
  settingsFailure,
} from "@/lib/studio-errors";
import { canManageBookings, isUuid } from "@/lib/studio-view";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const BOOKING_ADDRESS = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const MANAGE_URL = /^https:\/\/[^\s]+\{token\}[^\s]*$/u;
/** The API caps money at 100,000,000 minor units (1,000,000.00). */
const MAX_MINOR = 100_000_000;
const WHOLE = /^\d+$/u;

const NOT_FOUND: StudioFailure = {
  kind: "not_found",
  message: "We could not find that business.",
  nextStep: "Go back to your businesses and choose again.",
};

const fail = (failure: StudioFailure): ActionState => ({
  status: "error",
  ...failure,
});

const invalid = (message: string): ActionState =>
  fail({
    kind: "invalid",
    message,
    nextStep: "Fix it and press Save again.",
  });

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

const whole = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => WHOLE.test(value), message)
    .transform(Number)
    .refine((value) => value >= min && value <= max, message);

const name = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(120, "Keep the name to 120 characters or fewer.");

const profileSchema = z.object({
  displayName: name("Enter the business name."),
  publicSlug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => BOOKING_ADDRESS.test(value),
      "The booking address is 3 to 60 letters, numbers or hyphens, and cannot start or end with a hyphen."
    ),
  timezone: z.string().trim().min(1, "Enter the business timezone."),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => CURRENCY.test(value),
      "Use a 3-letter currency code like XCD."
    ),
  slotStepMin: whole(5, 240, "Time slots are 5 to 240 minutes apart."),
  leadTimeMin: whole(0, 1440, "Notice is 0 to 1440 minutes."),
  horizonDays: whole(1, 365, "Booking window is 1 to 365 days."),
  cancelCutoffHours: whole(0, 720, "Cancellation cutoff is 0 to 720 hours."),
  notifyEmail: z
    .string()
    .trim()
    .max(254, "That email address is too long.")
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "That notification email does not look right."
    ),
  manageUrlTemplate: z
    .string()
    .trim()
    .max(500, "Keep the manage link to 500 characters or fewer.")
    .refine(
      (value) => value === "" || MANAGE_URL.test(value),
      "The manage link must start with https:// and contain {token}."
    ),
});

const serviceSchema = z.object({
  serviceId: z.string().refine((value) => value === "" || isUuid(value)),
  name: name("Enter the service name."),
  category: z
    .string()
    .trim()
    .max(80, "Keep the category to 80 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description to 2000 characters or fewer."),
  durationMin: whole(5, 720, "Duration is 5 to 720 minutes."),
  bufferBeforeMin: whole(0, 240, "Buffer before is 0 to 240 minutes."),
  bufferAfterMin: whole(0, 240, "Buffer after is 0 to 240 minutes."),
  price: z.string(),
  deposit: z.string(),
});

const providerSchema = z.object({
  providerId: z.string().refine((value) => value === "" || isUuid(value)),
  name: name("Enter the provider's name."),
});

type Authorised =
  | { ok: true; accessToken: string; organisationId: string }
  | { ok: false; state: ActionState };

/** Session, then the organisation from the person's own list, then the role. */
async function authorise(orgSlug: string): Promise<Authorised> {
  const returnTo = `/studio/${orgSlug}/settings`;
  if (!SLUG.test(orgSlug)) {
    return { ok: false, state: fail(NOT_FOUND) };
  }
  const session = await getSession();
  if (!session) {
    redirect(`/signin?${new URLSearchParams({ returnTo })}`);
  }
  try {
    const org = await findOrganisation(session.accessToken, orgSlug);
    if (!org) {
      return { ok: false, state: fail(NOT_FOUND) };
    }
    if (!canManageBookings(org.role)) {
      return { ok: false, state: fail(SETTINGS_ADMIN_REQUIRED) };
    }
    return {
      ok: true,
      accessToken: session.accessToken,
      organisationId: org.id,
    };
  } catch (error) {
    return { ok: false, state: failed(orgSlug, error) };
  }
}

/** Turns a thrown API error into form state; an ended session goes to sign-in. */
function failed(orgSlug: string, error: unknown): ActionState {
  const failure = settingsFailure(error);
  if (failure.kind === "signed_out") {
    redirect(
      `/signin?${new URLSearchParams({ returnTo: `/studio/${orgSlug}/settings` })}`
    );
  }
  // A refused value is the person's typo; only faults are worth an alert.
  if (!ResponseError.is(error) || error.status >= 500) {
    reportError(error, "studio");
  }
  return fail(failure);
}

function saved(orgSlug: string, message: string): ActionState {
  revalidatePath(`/studio/${orgSlug}/settings`);
  return { status: "done", message };
}

/** The minor-unit amount in a money field; empty means 0. */
function moneyField(text: string): number | null {
  return text.trim() === "" ? 0 : parseMoney(text);
}

export async function saveProfileAction(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return auth.state;
  }
  const parsed = profileSchema.safeParse({
    displayName: field(formData, "displayName"),
    publicSlug: field(formData, "publicSlug"),
    timezone: field(formData, "timezone"),
    currency: field(formData, "currency"),
    slotStepMin: field(formData, "slotStepMin"),
    leadTimeMin: field(formData, "leadTimeMin"),
    horizonDays: field(formData, "horizonDays"),
    cancelCutoffHours: field(formData, "cancelCutoffHours"),
    notifyEmail: field(formData, "notifyEmail"),
    manageUrlTemplate: field(formData, "manageUrlTemplate"),
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const input = parsed.data;
  try {
    await saveProfile(auth.accessToken, auth.organisationId, {
      public_slug: input.publicSlug,
      display_name: input.displayName,
      enabled: formData.get("enabled") === "on",
      timezone: input.timezone,
      currency: input.currency,
      slot_step_min: input.slotStepMin,
      lead_time_min: input.leadTimeMin,
      horizon_days: input.horizonDays,
      cancel_cutoff_hours: input.cancelCutoffHours,
      requires_confirmation: formData.get("requiresConfirmation") === "on",
      notify_email: input.notifyEmail || null,
      manage_url_template: input.manageUrlTemplate || null,
    });
  } catch (error) {
    return failed(orgSlug, error);
  }
  return saved(orgSlug, "Business profile saved.");
}

export async function saveServiceAction(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return auth.state;
  }
  const parsed = serviceSchema.safeParse({
    serviceId: field(formData, "serviceId"),
    name: field(formData, "name"),
    category: field(formData, "category"),
    description: field(formData, "description"),
    durationMin: field(formData, "durationMin"),
    bufferBeforeMin: field(formData, "bufferBeforeMin"),
    bufferAfterMin: field(formData, "bufferAfterMin"),
    price: field(formData, "price"),
    deposit: field(formData, "deposit"),
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const input = parsed.data;
  const price = moneyField(input.price);
  const deposit = moneyField(input.deposit);
  if (price === null) {
    return invalid("Enter the price as an amount like 25 or 25.50.");
  }
  if (deposit === null) {
    return invalid("Enter the deposit as an amount like 10 or 10.50.");
  }
  if (price > MAX_MINOR || deposit > MAX_MINOR) {
    return invalid("Prices and deposits are at most 1,000,000.");
  }
  if (deposit > price) {
    return invalid("The deposit cannot exceed the price.");
  }
  const body = {
    name: input.name,
    category: input.category || null,
    description: input.description || null,
    duration_min: input.durationMin,
    buffer_before_min: input.bufferBeforeMin,
    buffer_after_min: input.bufferAfterMin,
    price_minor: price,
    deposit_minor: deposit,
    active: formData.get("active") === "on",
  };
  try {
    if (input.serviceId === "") {
      await createService(auth.accessToken, auth.organisationId, body);
    } else {
      await updateService(
        auth.accessToken,
        auth.organisationId,
        input.serviceId,
        body
      );
    }
  } catch (error) {
    return failed(orgSlug, error);
  }
  return saved(
    orgSlug,
    input.serviceId === "" ? "Service added." : "Service saved."
  );
}

export async function saveProviderAction(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return auth.state;
  }
  const parsed = providerSchema.safeParse({
    providerId: field(formData, "providerId"),
    name: field(formData, "name"),
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const input = parsed.data;
  const serviceIds = formData
    .getAll("serviceIds")
    .filter(
      (value): value is string => typeof value === "string" && isUuid(value)
    );
  const body = {
    name: input.name,
    active: formData.get("active") === "on",
    service_ids: serviceIds,
  };
  try {
    if (input.providerId === "") {
      await createProvider(auth.accessToken, auth.organisationId, body);
    } else {
      await updateProvider(
        auth.accessToken,
        auth.organisationId,
        input.providerId,
        body
      );
    }
  } catch (error) {
    return failed(orgSlug, error);
  }
  return saved(
    orgSlug,
    input.providerId === "" ? "Provider added." : "Provider saved."
  );
}

export async function saveHoursAction(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return auth.state;
  }
  const providerId = field(formData, "providerId");
  if (!isUuid(providerId)) {
    return invalid("Choose a provider and try again.");
  }
  const hours = parseHours(formData.entries());
  if (!hours.ok) {
    return invalid(hours.message);
  }
  try {
    await replaceHours(
      auth.accessToken,
      auth.organisationId,
      providerId,
      hours.periods
    );
  } catch (error) {
    return failed(orgSlug, error);
  }
  return saved(orgSlug, "Weekly hours saved.");
}
