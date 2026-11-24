"use server";

// Business settings: profile, services, providers and weekly hours. Every
// action re-checks the session, re-derives the organisation from the person's
// own list by slug (the browser never names an organisation id) and refuses a
// member before any API call. FastAPI still enforces the role. None of these
// routes takes an Idempotency-Key: each is a replace or an addressed update,
// so a repeat is harmless (a repeated create adds a second row, which the
// page shows). Sentry gets the error only, never the form values.

import {
  type BookingPaymentMode,
  type BookingProfilePublic,
  type BookingProfileUpdate,
  ResponseError,
} from "@barrelsgd/api-client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  BOOKING_POLICY_MAX,
  cleanPolicy,
  policyLength,
} from "@/lib/booking-policy-text";
import { isLogoFileId, LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/brand-logo";
import { checkContacts, contactFieldErrors } from "@/lib/business-contact";
import type { CalendarFeedState } from "@/lib/calendar-feed";
import { depositRuleFields, minimumPriceFields } from "@/lib/deposit-rule";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import { parseHours, parseMoney } from "@/lib/settings-view";
import type { ActionState, ProfileState } from "@/lib/studio-action-state";
import {
  completeLogoUpload,
  createCalendarFeed,
  createException,
  createLogoUpload,
  createProvider,
  createService,
  deleteException,
  findOrganisation,
  getBusinessTimezone,
  getProfile,
  replaceHours,
  rotateCalendarFeed,
  saveProfile,
  updateProvider,
  updateService,
} from "@/lib/studio-api";
import {
  logoUploadFailure,
  SETTINGS_ADMIN_REQUIRED,
  type StudioFailure,
  settingsFailure,
} from "@/lib/studio-errors";
import { canManageBookings, isUuid } from "@/lib/studio-view";
import {
  type TimeOffFieldErrors,
  type TimeOffState,
  timeOffFieldErrors,
  timeOffWindow,
} from "@/lib/time-off";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const BOOKING_ADDRESS = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const MANAGE_URL = /^https:\/\/[^\s]+\{token\}[^\s]*$/u;
/** The API caps money at 100,000,000 minor units (1,000,000.00). */
const MAX_MINOR = 100_000_000;
const WHOLE = /^\d+$/u;

const CONTACT_INVALID = "Check the highlighted contact options.";
const BRAND_INVALID = "Use a colour like #0b63ee: a # and six hex digits.";
const LOGO_INVALID = "That logo is not a valid upload. Upload it again.";
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/u;

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
  return { status: "success", message };
}

/** The payment choice; anything but full price is the deposit default. */
function paymentAtBooking(formData: FormData): BookingPaymentMode {
  return formData.get("paymentAtBooking") === "full_price"
    ? "full_price"
    : "deposit";
}

/**
 * The brand colour: empty clears it, else six-digit hex saved in lower case. The
 * API keeps any valid colour; mail falls back to navy when it is too pale.
 */
function brandColourField(text: string): string | null | undefined {
  const value = text.trim();
  if (value === "") {
    return null;
  }
  return HEX_COLOUR.test(value) ? value.toLowerCase() : undefined;
}

/** The logo's file id: empty clears it, else it must be a UUID. */
function logoFileField(text: string): string | null | undefined {
  const value = text.trim();
  if (value === "") {
    return null;
  }
  return isLogoFileId(value) ? value : undefined;
}

/** The minor-unit amount in a money field; empty means 0. */
function moneyField(text: string): number | null {
  return text.trim() === "" ? 0 : parseMoney(text);
}

/**
 * The three profile sections. Each has its own form and Save button; the API
 * replaces the whole profile on every write, so a section sends the stored
 * values for everything it does not own (see `keptFields`).
 */
type ProfileSection = "profile" | "contact" | "payments" | "deposit" | "policy";

function profileSection(formData: FormData): ProfileSection {
  const value = field(formData, "section");
  return value === "contact" ||
    value === "payments" ||
    value === "deposit" ||
    value === "policy"
    ? value
    : "profile";
}

/**
 * Keys the API returns on a stored profile but never takes on write. Every
 * other key is kept, so a field added to the profile later (listing, category,
 * city, ...) survives a section save without this list being edited.
 */
const READ_ONLY_PROFILE_KEYS: readonly string[] = [
  "id",
  "organisation_id",
  "created_at",
  "updated_at",
];

/**
 * Every writable field of a stored profile, as the replace body the API takes.
 * Built from the stored object itself, so no field is dropped by omission.
 */
function storedFields(current: BookingProfilePublic): BookingProfileUpdate {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) {
    if (!READ_ONLY_PROFILE_KEYS.includes(key)) {
      body[key] = value;
    }
  }
  return body as BookingProfileUpdate;
}

/**
 * The values a section keeps when it does not own them: the stored profile, or
 * for a business with no profile yet, blank contacts and the deposit default.
 */
function keptFields(
  current: BookingProfilePublic | null
): Partial<BookingProfileUpdate> {
  if (current) {
    return storedFields(current);
  }
  return {
    contact_phone: null,
    contact_whatsapp: null,
    contact_instagram: null,
    contact_email: null,
    payment_at_booking: "deposit",
  };
}

const SECTION_SAVED: Record<ProfileSection, string> = {
  profile: "Business profile saved.",
  contact: "Contact options saved.",
  payments: "Payment choice saved.",
  deposit: "Deposit rule saved.",
  policy: "Booking policy saved.",
};

/**
 * Saves one profile section. The profile section owns the name, address,
 * hours rules, notices, brand and the booking-page switch; the contact section
 * owns the four contact options; the payments section owns the payment choice.
 * Anything a section leaves out is kept as it is stored.
 */
export async function saveProfileAction(
  orgSlug: string,
  _previous: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return auth.state;
  }
  const section = profileSection(formData);

  if (section === "payments") {
    return savePaymentsSection(orgSlug, auth, formData);
  }
  if (section === "deposit") {
    return saveDepositSection(orgSlug, auth, formData);
  }
  if (section === "policy") {
    return savePolicySection(orgSlug, auth, formData);
  }
  if (section === "contact") {
    return saveContactSection(orgSlug, auth, formData);
  }
  return saveProfileSection(orgSlug, auth, formData);
}

type Granted = Extract<Authorised, { ok: true }>;

/** The stored profile for a section that edits an existing one; null with none. */
async function currentProfile(
  auth: Granted
): Promise<BookingProfilePublic | null> {
  return (await getProfile(auth.accessToken, auth.organisationId)) ?? null;
}

async function saveProfileSection(
  orgSlug: string,
  auth: Granted,
  formData: FormData
): Promise<ProfileState> {
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
  const brandColor = brandColourField(field(formData, "brandColor"));
  if (brandColor === undefined) {
    return invalid(BRAND_INVALID);
  }
  const logoFileId = logoFileField(field(formData, "logoFileId"));
  if (logoFileId === undefined) {
    return invalid(LOGO_INVALID);
  }
  try {
    const current = await currentProfile(auth);
    await saveProfile(auth.accessToken, auth.organisationId, {
      ...keptFields(current),
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
      brand_color: brandColor,
      logo_file_id: logoFileId,
      listed: formData.get("listed") === "on",
      category: field(formData, "category").trim() || null,
      short_description: field(formData, "shortDescription").trim() || null,
      city: field(formData, "city").trim() || null,
    });
  } catch (error) {
    return failed(orgSlug, error);
  }
  return saved(orgSlug, SECTION_SAVED.profile);
}

async function saveContactSection(
  orgSlug: string,
  auth: Granted,
  formData: FormData
): Promise<ProfileState> {
  const contacts = checkContacts({
    contactPhone: field(formData, "contactPhone"),
    contactWhatsapp: field(formData, "contactWhatsapp"),
    contactInstagram: field(formData, "contactInstagram"),
    contactEmail: field(formData, "contactEmail"),
  });
  if (!contacts.ok) {
    return {
      status: "error",
      kind: "invalid",
      message: CONTACT_INVALID,
      nextStep: "Fix it and press Save again.",
      fields: contacts.fields,
    };
  }
  try {
    const current = await currentProfile(auth);
    if (!current) {
      return invalid(
        "Save the business profile first, then add contact options."
      );
    }
    await saveProfile(auth.accessToken, auth.organisationId, {
      ...storedFields(current),
      ...contacts.body,
    });
  } catch (error) {
    const state = failed(orgSlug, error);
    const fields = ResponseError.is(error)
      ? contactFieldErrors(error.data)
      : undefined;
    if (state.status !== "error" || !fields) {
      return state;
    }
    return { ...state, message: CONTACT_INVALID, fields };
  }
  return saved(orgSlug, SECTION_SAVED.contact);
}

async function savePaymentsSection(
  orgSlug: string,
  auth: Granted,
  formData: FormData
): Promise<ProfileState> {
  try {
    const current = await currentProfile(auth);
    if (!current) {
      return invalid(
        "Save the business profile first, then choose how customers pay."
      );
    }
    await saveProfile(auth.accessToken, auth.organisationId, {
      ...storedFields(current),
      payment_at_booking: paymentAtBooking(formData),
    });
  } catch (error) {
    return failed(orgSlug, error);
  }
  return saved(orgSlug, SECTION_SAVED.payments);
}

/**
 * The business-wide deposit rule. Off saves `none` with no amounts; the API
 * refuses an incomplete rule, so the form's own checks run first.
 */
async function saveDepositSection(
  orgSlug: string,
  auth: Granted,
  formData: FormData
): Promise<ProfileState> {
  const on = formData.get("depositRequired") === "on";
  const rule = depositRuleFields({
    on,
    mode: formData.get("depositMode") === "fixed" ? "fixed" : "percent",
    percentText: field(formData, "depositPercent"),
    fixedText: field(formData, "depositFixed"),
  });
  if (!rule.ok) {
    return invalid(rule.message);
  }
  // The minimum is only on the form while the rule is on, so a rule switched off
  // keeps the stored minimum (it is not on the page to be changed).
  const minimum = on
    ? minimumPriceFields(field(formData, "depositMinPrice"))
    : null;
  if (minimum && !minimum.ok) {
    return invalid(minimum.message);
  }
  try {
    const current = await currentProfile(auth);
    if (!current) {
      return invalid("Save the business profile first, then set a deposit.");
    }
    await saveProfile(auth.accessToken, auth.organisationId, {
      ...storedFields(current),
      ...rule.value,
      ...(minimum?.ok ? { deposit_min_price_minor: minimum.value } : {}),
      deposit_non_refundable: formData.get("depositNonRefundable") === "on",
    });
  } catch (error) {
    return failed(orgSlug, error);
  }
  return saved(orgSlug, SECTION_SAVED.deposit);
}

/**
 * The booking policy: plain text, at most 1000 characters, shown before the
 * customer confirms and in the confirmation. Blank clears it.
 */
async function savePolicySection(
  orgSlug: string,
  auth: Granted,
  formData: FormData
): Promise<ProfileState> {
  const text = field(formData, "bookingPolicy");
  if (policyLength(text) > BOOKING_POLICY_MAX) {
    return invalid(
      `The booking policy is at most ${BOOKING_POLICY_MAX} characters.`
    );
  }
  try {
    const current = await currentProfile(auth);
    if (!current) {
      return invalid(
        "Save the business profile first, then add a booking policy."
      );
    }
    await saveProfile(auth.accessToken, auth.organisationId, {
      ...storedFields(current),
      booking_policy: cleanPolicy(text),
    });
  } catch (error) {
    return failed(orgSlug, error);
  }
  return saved(orgSlug, SECTION_SAVED.policy);
}

export interface LogoTarget {
  headers: Record<string, string>;
  id: string;
  url: string;
}

export type LogoStart =
  | { ok: true; target: LogoTarget }
  | { ok: false; message: string };

export type LogoFinish =
  | { ok: true; fileId: string }
  | { ok: false; message: string };

const LOGO_UPLOAD = z.object({
  contentType: z
    .string()
    .refine((type) => LOGO_TYPES.includes(type), "Unsupported image type"),
  sizeBytes: z.number().int().positive().max(LOGO_MAX_BYTES),
});

/** Step 1 of a logo upload: the presigned PUT. The file itself goes from the browser. */
export async function startLogoUploadAction(
  orgSlug: string,
  upload: { contentType: string; sizeBytes: number }
): Promise<LogoStart> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return { ok: false, message: refusalMessage(auth.state) };
  }
  const parsed = LOGO_UPLOAD.safeParse(upload);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Choose a JPEG, PNG or WebP image up to 2 MB.",
    };
  }
  try {
    const ticket = await createLogoUpload(
      auth.accessToken,
      auth.organisationId,
      {
        content_type: parsed.data.contentType,
        size_bytes: parsed.data.sizeBytes,
      }
    );
    return {
      ok: true,
      target: { id: ticket.id, url: ticket.url, headers: ticket.headers },
    };
  } catch (error) {
    return { ok: false, message: logoFailed(orgSlug, error) };
  }
}

/** Step 3 of a logo upload: the API confirms the file and returns its id. */
export async function finishLogoUploadAction(
  orgSlug: string,
  uploadId: string
): Promise<LogoFinish> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return { ok: false, message: refusalMessage(auth.state) };
  }
  if (!isUuid(uploadId)) {
    return { ok: false, message: "That upload is not valid. Upload it again." };
  }
  try {
    const stored = await completeLogoUpload(
      auth.accessToken,
      auth.organisationId,
      uploadId
    );
    return { ok: true, fileId: stored.id };
  } catch (error) {
    return { ok: false, message: logoFailed(orgSlug, error) };
  }
}

/** The refusal a logo step shows when the session or role check fails first. */
function refusalMessage(state: ActionState): string {
  return state.status === "error" ? state.message : "Try again in a moment.";
}

/** A logo step's failure as one line for the form; sign-in and faults as usual. */
function logoFailed(orgSlug: string, error: unknown): string {
  // `failed` ends a lapsed session (redirect) and reports faults; it is called
  // for those effects, and the upload's own wording is shown.
  failed(orgSlug, error);
  const failure = logoUploadFailure(error);
  return `${failure.message} ${failure.nextStep}`;
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

const REASON_MAX = 200;

/** A refused time-off add: the message, and the fields the API or the rules named. */
function timeOffRefusal(
  message: string,
  nextStep: string,
  fields?: TimeOffFieldErrors
): TimeOffState {
  return {
    status: "error",
    kind: "invalid",
    message,
    nextStep,
    ...(fields ? { fields } : {}),
  };
}

/**
 * Adds time off for one provider. The typed times are on the business clock
 * (its own profile timezone, read here, not trusted from the form), so they
 * become UTC before the API sees them.
 */
export async function saveTimeOffAction(
  orgSlug: string,
  _previous: TimeOffState,
  formData: FormData
): Promise<TimeOffState> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return auth.state;
  }
  const providerId = field(formData, "providerId");
  if (!isUuid(providerId)) {
    return timeOffRefusal(
      "Choose a provider and try again.",
      "Reload the settings and add the time off again."
    );
  }
  const reason = field(formData, "reason").trim();
  if (reason.length > REASON_MAX) {
    return timeOffRefusal(
      "The reason is too long.",
      "Keep the reason to 200 characters or fewer.",
      { reason: "Keep the reason to 200 characters or fewer." }
    );
  }
  try {
    const zone = await getBusinessTimezone(
      auth.accessToken,
      auth.organisationId
    );
    const window = timeOffWindow(
      field(formData, "startsAt"),
      field(formData, "endsAt"),
      zone
    );
    if (!window.ok) {
      return timeOffRefusal(
        window.message,
        "Fix the highlighted fields.",
        window.fields
      );
    }
    await createException(auth.accessToken, auth.organisationId, providerId, {
      kind: "time_off",
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      reason: reason || null,
    });
  } catch (error) {
    const state = failed(orgSlug, error);
    const fields = ResponseError.is(error)
      ? timeOffFieldErrors(error.data)
      : undefined;
    if (state.status !== "error" || !fields) {
      return state;
    }
    return { ...state, message: "Check the highlighted fields.", fields };
  }
  return saved(orgSlug, "Time off added.");
}

/**
 * Removes one time-off or extra-hours row. The client asks first (a dialog);
 * a row that is already gone answers 404 and the page says so.
 */
export async function removeTimeOffAction(
  orgSlug: string,
  exceptionId: string,
  _previous: TimeOffState,
  _formData: FormData
): Promise<TimeOffState> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return auth.state;
  }
  if (!isUuid(exceptionId)) {
    return timeOffRefusal(
      "That time off no longer exists.",
      "Reload the settings and try again."
    );
  }
  try {
    await deleteException(auth.accessToken, auth.organisationId, exceptionId);
  } catch (error) {
    return failed(orgSlug, error);
  }
  return saved(orgSlug, "Time off removed.");
}

// --- calendar feed (Settings > Calendar) ---------------------------------------------------
// The address is returned by the API once. It is handed back in this action's
// state for the owner to copy, and is not logged, stored or revalidated into
// the page. Owners and admins only; FastAPI answers 403 to anyone else.

const CALENDAR_ADDED =
  "Calendar link made. Add it to your phone now: this is the only time the address is shown.";
const CALENDAR_RESET =
  "Calendar link reset. The old address no longer works. Add the new one to your phone now: it is shown only this once.";

/** Makes the business's calendar feed and hands its address back once. */
export async function createCalendarFeedAction(
  orgSlug: string,
  _previous: CalendarFeedState,
  _formData: FormData
): Promise<CalendarFeedState> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return auth.state;
  }
  try {
    const link = await createCalendarFeed(
      auth.accessToken,
      auth.organisationId
    );
    revalidatePath(`/studio/${orgSlug}/settings`);
    return { status: "success", message: CALENDAR_ADDED, url: link.url };
  } catch (error) {
    return failed(orgSlug, error);
  }
}

/** Replaces the calendar feed's address; the old one stops working at once. */
export async function rotateCalendarFeedAction(
  orgSlug: string,
  _previous: CalendarFeedState,
  _formData: FormData
): Promise<CalendarFeedState> {
  const auth = await authorise(orgSlug);
  if (!auth.ok) {
    return auth.state;
  }
  try {
    const link = await rotateCalendarFeed(
      auth.accessToken,
      auth.organisationId
    );
    revalidatePath(`/studio/${orgSlug}/settings`);
    return { status: "success", message: CALENDAR_RESET, url: link.url };
  } catch (error) {
    return failed(orgSlug, error);
  }
}
