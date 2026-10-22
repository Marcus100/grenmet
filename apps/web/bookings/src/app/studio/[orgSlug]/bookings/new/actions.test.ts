import type { MembershipRole } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiError,
  BOOKING_ID,
  ORG_ID,
  PROVIDER_ID,
  session,
} from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/studio-api", () => ({
  createStudioBooking: vi.fn(),
  findOrganisation: vi.fn(),
  getBusinessTimezone: vi.fn(),
}));

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  createStudioBooking,
  findOrganisation,
  getBusinessTimezone,
} from "@/lib/studio-api";
import { createBookingAction } from "./actions";

const SLUG = "sea-salt";
const IDLE = { status: "idle" } as const;
const SERVICE_ID = "44444444-4444-4444-8444-444444444444";
const KEY = "99999999-9999-4999-8999-999999999999";

const VALID = {
  serviceId: SERVICE_ID,
  providerId: PROVIDER_ID,
  date: "2026-10-21",
  time: "14:00",
  customerName: "Ada Lovelace",
  customerPhone: "473 555 0100",
  customerEmail: "",
  notes: "",
  idempotencyKey: KEY,
};

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...VALID, ...values })) {
    data.set(key, value);
  }
  return data;
}

function org(role: MembershipRole) {
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: SLUG,
    role,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redirect).mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  });
  vi.mocked(getSession).mockResolvedValue(session);
  vi.mocked(getBusinessTimezone).mockResolvedValue("America/Grenada");
  org("admin");
});

describe("create booking action", () => {
  it("creates in the business's zone and goes to the new booking", async () => {
    vi.mocked(createStudioBooking).mockResolvedValue({
      id: BOOKING_ID,
    } as never);
    await expect(createBookingAction(SLUG, IDLE, form())).rejects.toMatchObject(
      {
        message: `NEXT_REDIRECT /studio/${SLUG}/bookings/${BOOKING_ID}`,
      }
    );
    expect(createStudioBooking).toHaveBeenCalledWith("tok", ORG_ID, KEY, {
      service_id: SERVICE_ID,
      provider_id: PROVIDER_ID,
      starts_at: "2026-10-21T18:00:00.000Z",
      customer_name: "Ada Lovelace",
      customer_phone: "473 555 0100",
      customer_email: null,
      notes: null,
      send_confirmation: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/studio/${SLUG}/agenda`);
  });

  it("sends people without a session to sign in", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(createBookingAction(SLUG, IDLE, form())).rejects.toMatchObject(
      {
        message:
          "NEXT_REDIRECT /signin?returnTo=%2Fstudio%2Fsea-salt%2Fbookings%2Fnew",
      }
    );
    expect(createStudioBooking).not.toHaveBeenCalled();
  });

  it("refuses a member without calling the API", async () => {
    org("member");
    const result = await createBookingAction(SLUG, IDLE, form());
    expect(result).toMatchObject({ status: "error", kind: "forbidden" });
    expect(createStudioBooking).not.toHaveBeenCalled();
  });

  it("asks for a name and for an email when a confirmation is wanted", async () => {
    expect(
      await createBookingAction(SLUG, IDLE, form({ customerName: " " }))
    ).toMatchObject({
      status: "error",
      message: "Enter the customer's name.",
    });
    const wanted = form();
    wanted.set("sendConfirmation", "on");
    expect(await createBookingAction(SLUG, IDLE, wanted)).toMatchObject({
      status: "error",
      message: "Add the customer's email to send them a confirmation.",
    });
    expect(createStudioBooking).not.toHaveBeenCalled();
  });

  it("explains a double booking and does not report it", async () => {
    vi.mocked(createStudioBooking).mockRejectedValue(apiError(409));
    const result = await createBookingAction(SLUG, IDLE, form());
    expect(result).toMatchObject({
      status: "error",
      kind: "conflict",
      message: "That provider is already booked at that time.",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports server faults and shows a retry message", async () => {
    vi.mocked(createStudioBooking).mockRejectedValue(apiError(500));
    const result = await createBookingAction(SLUG, IDLE, form());
    expect(result).toMatchObject({ status: "error", kind: "unavailable" });
    expect(reportError).toHaveBeenCalledWith(expect.anything(), "studio");
  });
});
