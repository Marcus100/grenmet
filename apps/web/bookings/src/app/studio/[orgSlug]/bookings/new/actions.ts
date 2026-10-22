"use server";

// Staff-entered bookings (phone, walk-in). The action re-checks the session
// and re-derives the organisation from the person's own list by slug; the
// browser supplies only the form fields and an idempotency key. The wall-clock
// time is read in the business's own timezone (from its profile, fetched here,
// never trusted from the form). FastAPI still enforces role and double-booking.

import { ResponseError } from "@barrelsgd/api-client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import type { ActionState } from "@/lib/studio-action-state";
import {
  createStudioBooking,
  findOrganisation,
  getBusinessTimezone,
} from "@/lib/studio-api";
import {
  ADMIN_REQUIRED,
  actionFailure,
  type StudioFailure,
} from "@/lib/studio-errors";
import {
  canManageBookings,
  isDay,
  isTime,
  isUuid,
  zonedToUtcIso,
} from "@/lib/studio-view";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

const text = (max: number, message: string) =>
  z.string().trim().max(max, message);

const schema = z.object({
  serviceId: z.string().refine(isUuid, "Choose a service."),
  providerId: z.string().refine(isUuid, "Choose who will do it."),
  date: z.string().refine(isDay, "Choose a date."),
  time: z.string().refine(isTime, "Choose a start time."),
  customerName: text(120, "Keep the name to 120 characters or fewer.").min(
    1,
    "Enter the customer's name."
  ),
  customerPhone: text(40, "Keep the phone number to 40 characters or fewer."),
  customerEmail: text(254, "That email address is too long.").refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "That email address does not look right."
  ),
  notes: text(1000, "Keep the notes to 1000 characters or fewer."),
  sendConfirmation: z.boolean(),
  idempotencyKey: z.string().refine(isUuid, "Reload the page and try again."),
});

function fail(failure: StudioFailure): ActionState {
  return { status: "error", ...failure };
}

function invalid(message: string): ActionState {
  return fail({
    kind: "invalid",
    message,
    nextStep: "Fix it and press Save booking again.",
  });
}

const IDEMPOTENCY_409 = /idempotency|still being processed/i;

/** The API's error body as text, matched defensively (no error codes yet). */
function detailText(data: unknown): string {
  try {
    return typeof data === "string" ? data : (JSON.stringify(data) ?? "");
  } catch {
    return "";
  }
}

function createFailure(error: unknown): StudioFailure {
  if (ResponseError.is(error) && error.status === 409) {
    if (IDEMPOTENCY_409.test(detailText(error.data))) {
      return {
        kind: "conflict",
        message: "That save is out of step with an earlier attempt.",
        nextStep: "Press Save booking again.",
      };
    }
    return {
      kind: "conflict",
      message: "That provider is already booked at that time.",
      nextStep: "Choose another time or another provider, then save again.",
    };
  }
  if (
    ResponseError.is(error) &&
    (error.status === 400 || error.status === 422)
  ) {
    return {
      kind: "invalid",
      message: "The booking was not accepted.",
      nextStep:
        "Check the service, provider, date and time, and that the provider offers the service.",
    };
  }
  return actionFailure(error);
}

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

export async function createBookingAction(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const returnTo = `/studio/${orgSlug}/bookings/new`;
  if (!SLUG.test(orgSlug)) {
    return fail({
      kind: "not_found",
      message: "We could not find that business.",
      nextStep: "Go back to your businesses and choose again.",
    });
  }
  const session = await getSession();
  if (!session) {
    redirect(`/signin?${new URLSearchParams({ returnTo })}`);
  }
  const parsed = schema.safeParse({
    serviceId: field(formData, "serviceId"),
    providerId: field(formData, "providerId"),
    date: field(formData, "date"),
    time: field(formData, "time"),
    customerName: field(formData, "customerName"),
    customerPhone: field(formData, "customerPhone"),
    customerEmail: field(formData, "customerEmail"),
    notes: field(formData, "notes"),
    sendConfirmation: formData.get("sendConfirmation") === "on",
    idempotencyKey: field(formData, "idempotencyKey"),
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const input = parsed.data;
  if (input.sendConfirmation && input.customerEmail === "") {
    return invalid("Add the customer's email to send them a confirmation.");
  }

  let bookingId: string;
  try {
    const org = await findOrganisation(session.accessToken, orgSlug);
    if (!org) {
      return fail({
        kind: "not_found",
        message: "We could not find that business.",
        nextStep: "Go back to your businesses and choose again.",
      });
    }
    if (!canManageBookings(org.role)) {
      return fail(ADMIN_REQUIRED);
    }
    const zone = await getBusinessTimezone(session.accessToken, org.id);
    const booking = await createStudioBooking(
      session.accessToken,
      org.id,
      input.idempotencyKey,
      {
        service_id: input.serviceId,
        provider_id: input.providerId,
        starts_at: zonedToUtcIso(input.date, input.time, zone),
        customer_name: input.customerName,
        customer_phone: input.customerPhone || null,
        customer_email: input.customerEmail || null,
        notes: input.notes || null,
        send_confirmation: input.sendConfirmation,
      }
    );
    bookingId = booking.id;
  } catch (error) {
    const failure = createFailure(error);
    if (failure.kind === "signed_out") {
      redirect(`/signin?${new URLSearchParams({ returnTo })}`);
    }
    if (!ResponseError.is(error) || error.status >= 500) {
      reportError(error, "studio");
    }
    return fail(failure);
  }
  revalidatePath(`/studio/${orgSlug}/agenda`);
  redirect(`/studio/${orgSlug}/bookings/${bookingId}`);
}
