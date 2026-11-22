import type { MembershipRole } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, ORG_ID, PROVIDER_ID, session } from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/studio-api", () => ({
  completeLogoUpload: vi.fn(),
  createLogoUpload: vi.fn(),
  createException: vi.fn(),
  createProvider: vi.fn(),
  createService: vi.fn(),
  deleteException: vi.fn(),
  findOrganisation: vi.fn(),
  getBusinessTimezone: vi.fn(),
  replaceHours: vi.fn(),
  saveProfile: vi.fn(),
  updateProvider: vi.fn(),
  updateService: vi.fn(),
}));

import { redirect } from "next/navigation";
import { CONTACT_MESSAGES } from "@/lib/business-contact";
import { getSession } from "@/lib/session";
import {
  completeLogoUpload,
  createException,
  createLogoUpload,
  createProvider,
  createService,
  deleteException,
  findOrganisation,
  getBusinessTimezone,
  replaceHours,
  saveProfile,
  updateProvider,
  updateService,
} from "@/lib/studio-api";
import {
  finishLogoUploadAction,
  removeTimeOffAction,
  saveHoursAction,
  saveProfileAction,
  saveProviderAction,
  saveServiceAction,
  saveTimeOffAction,
  startLogoUploadAction,
} from "./actions";

const SLUG = "sea-salt";
const ADMIN_ACCESS = /admin access/u;
const IDLE = { status: "idle" } as const;
const SERVICE_ID = "44444444-4444-4444-8444-444444444444";
const EXCEPTION_ID = "55555555-5555-4555-8555-555555555555";
const LEAVE = {
  providerId: PROVIDER_ID,
  startsAt: "2026-11-20T09:00",
  endsAt: "2026-11-20T17:00",
  reason: "Annual leave",
};

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(key, item);
    }
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
  org("admin");
});

const PROFILE = {
  displayName: "Sea Salt Spa",
  publicSlug: "Sea-Salt",
  timezone: "America/Grenada",
  currency: "xcd",
  slotStepMin: "30",
  leadTimeMin: "120",
  horizonDays: "60",
  cancelCutoffHours: "24",
  notifyEmail: "",
  manageUrlTemplate: "",
  enabled: "on",
};

const SERVICE = {
  serviceId: "",
  name: "Massage",
  category: "",
  description: "",
  durationMin: "60",
  bufferBeforeMin: "0",
  bufferAfterMin: "10",
  price: "150",
  deposit: "25.50",
  active: "on",
};

describe("shared gates", () => {
  it("sends people without a session to sign in", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(
      saveProfileAction(SLUG, IDLE, form(PROFILE))
    ).rejects.toMatchObject({
      message: "NEXT_REDIRECT /signin?returnTo=%2Fstudio%2Fsea-salt%2Fsettings",
    });
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("refuses a member before any save, for every action", async () => {
    org("member");
    const results = [
      await saveProfileAction(SLUG, IDLE, form(PROFILE)),
      await saveServiceAction(SLUG, IDLE, form(SERVICE)),
      await saveProviderAction(SLUG, IDLE, form({ name: "Maya" })),
      await saveHoursAction(SLUG, IDLE, form({ providerId: PROVIDER_ID })),
    ];
    for (const result of results) {
      expect(result).toMatchObject({ status: "error", kind: "forbidden" });
    }
    expect(saveProfile).not.toHaveBeenCalled();
    expect(createService).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
    expect(replaceHours).not.toHaveBeenCalled();
  });

  it("does not find a business that is not in the person's list", async () => {
    vi.mocked(findOrganisation).mockResolvedValue(null);
    expect(await saveProfileAction(SLUG, IDLE, form(PROFILE))).toMatchObject({
      kind: "not_found",
    });
    expect(await saveProfileAction("../x", IDLE, form(PROFILE))).toMatchObject({
      kind: "not_found",
    });
    expect(saveProfile).not.toHaveBeenCalled();
  });
});

describe("profile", () => {
  it("saves the whole profile for the resolved organisation", async () => {
    vi.mocked(saveProfile).mockResolvedValue({} as never);
    const result = await saveProfileAction(SLUG, IDLE, form(PROFILE));
    expect(result).toMatchObject({ status: "success" });
    expect(saveProfile).toHaveBeenCalledWith("tok", ORG_ID, {
      public_slug: "sea-salt",
      display_name: "Sea Salt Spa",
      enabled: true,
      timezone: "America/Grenada",
      currency: "XCD",
      slot_step_min: 30,
      lead_time_min: 120,
      horizon_days: 60,
      cancel_cutoff_hours: 24,
      requires_confirmation: false,
      payment_at_booking: "deposit",
      notify_email: null,
      manage_url_template: null,
      contact_phone: null,
      contact_whatsapp: null,
      contact_instagram: null,
      contact_email: null,
      brand_color: null,
      logo_file_id: null,
      listed: false,
      category: null,
      short_description: null,
      city: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/studio/${SLUG}/settings`);
  });

  it("saves the home page listing switch and its text, blank as null", async () => {
    vi.mocked(saveProfile).mockResolvedValue({} as never);
    const result = await saveProfileAction(
      SLUG,
      IDLE,
      form({
        ...PROFILE,
        listed: "on",
        category: " Hair ",
        shortDescription: "Cuts and colour",
        city: "  ",
      })
    );
    expect(result).toMatchObject({ status: "success" });
    expect(saveProfile).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      expect.objectContaining({
        listed: true,
        category: "Hair",
        short_description: "Cuts and colour",
        city: null,
      })
    );
  });

  it("keeps the business off the home page unless the switch is on", async () => {
    vi.mocked(saveProfile).mockResolvedValue({} as never);
    await saveProfileAction(SLUG, IDLE, form({ ...PROFILE, listed: "" }));
    expect(saveProfile).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      expect.objectContaining({ listed: false })
    );
  });

  it("saves the full-price choice and treats anything else as deposit", async () => {
    vi.mocked(saveProfile).mockResolvedValue({} as never);
    await saveProfileAction(
      SLUG,
      IDLE,
      form({ ...PROFILE, paymentAtBooking: "full_price" })
    );
    expect(saveProfile).toHaveBeenLastCalledWith(
      "tok",
      ORG_ID,
      expect.objectContaining({ payment_at_booking: "full_price" })
    );
    await saveProfileAction(
      SLUG,
      IDLE,
      form({ ...PROFILE, paymentAtBooking: "everything" })
    );
    expect(saveProfile).toHaveBeenLastCalledWith(
      "tok",
      ORG_ID,
      expect.objectContaining({ payment_at_booking: "deposit" })
    );
  });

  it("saves the contact options in the form the public page links to", async () => {
    vi.mocked(saveProfile).mockResolvedValue({} as never);
    const result = await saveProfileAction(
      SLUG,
      IDLE,
      form({
        ...PROFILE,
        contactPhone: "+1 (473) 440-1234",
        contactWhatsapp: "+1 473 440 5678",
        contactInstagram: "https://www.instagram.com/seasaltspa/",
        contactEmail: " hello@seasalt.example ",
      })
    );
    expect(result).toMatchObject({ status: "success" });
    expect(saveProfile).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      expect.objectContaining({
        contact_phone: "+14734401234",
        contact_whatsapp: "14734405678",
        contact_instagram: "seasaltspa",
        contact_email: "hello@seasalt.example",
      })
    );
  });

  it("names each wrong contact option without calling the API", async () => {
    const result = await saveProfileAction(
      SLUG,
      IDLE,
      form({
        ...PROFILE,
        contactPhone: "473 440 1234",
        contactWhatsapp: "call me",
        contactInstagram: "https://facebook.com/seasalt",
        contactEmail: "nope",
      })
    );
    expect(result).toMatchObject({
      status: "error",
      kind: "invalid",
      message: "Check the highlighted contact options.",
      fields: {
        contactPhone: CONTACT_MESSAGES.contactPhone,
        contactWhatsapp: CONTACT_MESSAGES.contactWhatsapp,
        contactInstagram: CONTACT_MESSAGES.contactInstagram,
        contactEmail: CONTACT_MESSAGES.contactEmail,
      },
    });
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("points at the contact option the API refused", async () => {
    vi.mocked(saveProfile).mockRejectedValue(
      apiError(422, {
        detail: "Validation error",
        errors: [
          {
            loc: ["body", "contact_instagram"],
            msg: "Value error, Enter an Instagram handle",
          },
        ],
      })
    );
    const result = await saveProfileAction(SLUG, IDLE, form(PROFILE));
    expect(result).toMatchObject({
      status: "error",
      message: "Check the highlighted contact options.",
      fields: { contactInstagram: CONTACT_MESSAGES.contactInstagram },
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("refuses bad values without calling the API", async () => {
    for (const bad of [
      { publicSlug: "-x-" },
      { currency: "XC" },
      { slotStepMin: "2" },
      { cancelCutoffHours: "999" },
      { notifyEmail: "nope" },
      { manageUrlTemplate: "http://x/{token}" },
      { displayName: " " },
    ]) {
      expect(
        await saveProfileAction(SLUG, IDLE, form({ ...PROFILE, ...bad }))
      ).toMatchObject({ status: "error", kind: "invalid" });
    }
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("explains a taken address without alerting Sentry", async () => {
    vi.mocked(saveProfile).mockRejectedValue(
      apiError(409, { detail: "That booking address is already in use" })
    );
    expect(await saveProfileAction(SLUG, IDLE, form(PROFILE))).toMatchObject({
      kind: "conflict",
      message: "That booking address is already in use.",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a server fault and keeps the form usable", async () => {
    const fault = apiError(500);
    vi.mocked(saveProfile).mockRejectedValue(fault);
    expect(await saveProfileAction(SLUG, IDLE, form(PROFILE))).toMatchObject({
      kind: "unavailable",
    });
    expect(reportError).toHaveBeenCalledWith(fault, "studio");
  });
});

describe("brand", () => {
  const LOGO = "6f1c2a3e-1b2c-4d5e-8f90-a1b2c3d4e5f6";

  it("saves a valid colour in lower case with the logo", async () => {
    vi.mocked(saveProfile).mockResolvedValue({} as never);
    await saveProfileAction(
      SLUG,
      IDLE,
      form({ ...PROFILE, brandColor: " #0B63EE ", logoFileId: LOGO })
    );
    expect(saveProfile).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      expect.objectContaining({ brand_color: "#0b63ee", logo_file_id: LOGO })
    );
  });

  it("clears the colour and the logo when they are blank", async () => {
    vi.mocked(saveProfile).mockResolvedValue({} as never);
    await saveProfileAction(
      SLUG,
      IDLE,
      form({ ...PROFILE, brandColor: "  ", logoFileId: "" })
    );
    expect(saveProfile).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      expect.objectContaining({ brand_color: null, logo_file_id: null })
    );
  });

  it.each(["0b63ee", "#0b63e", "#gggggg", "red"])(
    "refuses %j without calling the API",
    async (brandColor) => {
      const result = await saveProfileAction(
        SLUG,
        IDLE,
        form({ ...PROFILE, brandColor })
      );
      expect(result).toMatchObject({
        status: "error",
        message: "Use a colour like #0b63ee: a # and six hex digits.",
      });
      expect(saveProfile).not.toHaveBeenCalled();
    }
  );

  it("refuses a logo id that is not a UUID", async () => {
    const result = await saveProfileAction(
      SLUG,
      IDLE,
      form({ ...PROFILE, logoFileId: "../../x" })
    );
    expect(result).toMatchObject({ status: "error" });
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("shows the API's plain 409 when the logo is not a finished upload", async () => {
    vi.mocked(saveProfile).mockRejectedValue(
      apiError(409, {
        detail: "That logo is not a finished upload for this business",
      })
    );
    const result = await saveProfileAction(
      SLUG,
      IDLE,
      form({ ...PROFILE, logoFileId: LOGO })
    );
    expect(result).toMatchObject({
      status: "error",
      kind: "conflict",
      message: "That logo did not finish uploading for this business.",
    });
  });

  it("refuses a member before any upload is started", async () => {
    org("member");
    const result = await startLogoUploadAction(SLUG, {
      contentType: "image/png",
      sizeBytes: 1000,
    });
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(ADMIN_ACCESS),
    });
    expect(createLogoUpload).not.toHaveBeenCalled();
  });

  it("starts a booking-logo upload for the resolved organisation", async () => {
    vi.mocked(createLogoUpload).mockResolvedValue({
      id: LOGO,
      url: "https://storage.test/put",
      headers: { "Content-Type": "image/png" },
      expires_at: "2026-11-22T10:00:00Z",
      max_bytes: 2_097_152,
    } as never);
    const result = await startLogoUploadAction(SLUG, {
      contentType: "image/png",
      sizeBytes: 1000,
    });
    expect(createLogoUpload).toHaveBeenCalledWith("tok", ORG_ID, {
      content_type: "image/png",
      size_bytes: 1000,
    });
    expect(result).toEqual({
      ok: true,
      target: {
        id: LOGO,
        url: "https://storage.test/put",
        headers: { "Content-Type": "image/png" },
      },
    });
  });

  it("refuses a file type or size the logo rules do not allow, before the API", async () => {
    expect(
      await startLogoUploadAction(SLUG, {
        contentType: "image/svg+xml",
        sizeBytes: 10,
      })
    ).toMatchObject({ ok: false });
    expect(
      await startLogoUploadAction(SLUG, {
        contentType: "image/png",
        sizeBytes: 3 * 1024 * 1024,
      })
    ).toMatchObject({ ok: false });
    expect(createLogoUpload).not.toHaveBeenCalled();
  });

  it("shows the API's own words for a refused upload", async () => {
    vi.mocked(createLogoUpload).mockRejectedValue(
      apiError(422, { detail: "Only JPEG, PNG and WebP images are accepted" })
    );
    const result = await startLogoUploadAction(SLUG, {
      contentType: "image/webp",
      sizeBytes: 10,
    });
    expect(result).toEqual({
      ok: false,
      message:
        "Only JPEG, PNG and WebP images are accepted. Choose a different image and try again.",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("confirms a finished upload and returns the stored file id", async () => {
    vi.mocked(completeLogoUpload).mockResolvedValue({ id: LOGO } as never);
    expect(await finishLogoUploadAction(SLUG, LOGO)).toEqual({
      ok: true,
      fileId: LOGO,
    });
    expect(completeLogoUpload).toHaveBeenCalledWith("tok", ORG_ID, LOGO);
  });

  it("reports a fault in the confirm step and keeps the message plain", async () => {
    vi.mocked(completeLogoUpload).mockRejectedValue(apiError(503, {}));
    const result = await finishLogoUploadAction(SLUG, LOGO);
    expect(result).toMatchObject({ ok: false });
    expect(reportError).toHaveBeenCalled();
  });

  it("refuses a malformed upload id before the API", async () => {
    expect(await finishLogoUploadAction(SLUG, "x")).toMatchObject({
      ok: false,
    });
    expect(completeLogoUpload).not.toHaveBeenCalled();
  });
});

describe("services", () => {
  it("creates with money in minor units", async () => {
    vi.mocked(createService).mockResolvedValue({} as never);
    expect(await saveServiceAction(SLUG, IDLE, form(SERVICE))).toMatchObject({
      status: "success",
      message: "Service added.",
    });
    expect(createService).toHaveBeenCalledWith("tok", ORG_ID, {
      name: "Massage",
      category: null,
      description: null,
      duration_min: 60,
      buffer_before_min: 0,
      buffer_after_min: 10,
      price_minor: 15_000,
      deposit_minor: 2550,
      active: true,
    });
  });

  it("updates an existing service by id", async () => {
    vi.mocked(updateService).mockResolvedValue({} as never);
    await saveServiceAction(
      SLUG,
      IDLE,
      form({ ...SERVICE, serviceId: SERVICE_ID, active: [] as string[] })
    );
    expect(updateService).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      SERVICE_ID,
      expect.objectContaining({ active: false })
    );
    expect(createService).not.toHaveBeenCalled();
  });

  it("refuses a deposit above the price and bad amounts", async () => {
    expect(
      await saveServiceAction(SLUG, IDLE, form({ ...SERVICE, deposit: "200" }))
    ).toMatchObject({ message: "The deposit cannot exceed the price." });
    expect(
      await saveServiceAction(SLUG, IDLE, form({ ...SERVICE, price: "1,5" }))
    ).toMatchObject({ kind: "invalid" });
    expect(
      await saveServiceAction(
        SLUG,
        IDLE,
        form({ ...SERVICE, durationMin: "1" })
      )
    ).toMatchObject({ kind: "invalid" });
    expect(createService).not.toHaveBeenCalled();
  });

  it("enforces the API's money limit with its own message", async () => {
    expect(
      await saveServiceAction(
        SLUG,
        IDLE,
        form({ ...SERVICE, price: "1000000.01", deposit: "0" })
      )
    ).toMatchObject({ message: "Prices and deposits are at most 1,000,000." });
    vi.mocked(createService).mockResolvedValue({} as never);
    expect(
      await saveServiceAction(
        SLUG,
        IDLE,
        form({ ...SERVICE, price: "1000000", deposit: "0" })
      )
    ).toMatchObject({ status: "success" });
  });
});

describe("providers and hours", () => {
  it("creates a provider with only valid service ids", async () => {
    vi.mocked(createProvider).mockResolvedValue({} as never);
    await saveProviderAction(
      SLUG,
      IDLE,
      form({
        providerId: "",
        name: "Maya",
        serviceIds: [SERVICE_ID, "not-an-id"],
        active: "on",
      })
    );
    expect(createProvider).toHaveBeenCalledWith("tok", ORG_ID, {
      name: "Maya",
      active: true,
      service_ids: [SERVICE_ID],
    });
  });

  it("updates a provider", async () => {
    vi.mocked(updateProvider).mockResolvedValue({} as never);
    await saveProviderAction(
      SLUG,
      IDLE,
      form({ providerId: PROVIDER_ID, name: "Maya" })
    );
    expect(updateProvider).toHaveBeenCalledWith("tok", ORG_ID, PROVIDER_ID, {
      name: "Maya",
      active: false,
      service_ids: [],
    });
  });

  it("replaces the week, and a fully empty week is allowed", async () => {
    vi.mocked(replaceHours).mockResolvedValue([]);
    await saveHoursAction(
      SLUG,
      IDLE,
      form({
        providerId: PROVIDER_ID,
        "hours-0-0-start": "09:00",
        "hours-0-0-end": "17:00",
      })
    );
    expect(replaceHours).toHaveBeenCalledWith("tok", ORG_ID, PROVIDER_ID, [
      { weekday: 0, start_time: "09:00", end_time: "17:00" },
    ]);
    await saveHoursAction(SLUG, IDLE, form({ providerId: PROVIDER_ID }));
    expect(replaceHours).toHaveBeenLastCalledWith(
      "tok",
      ORG_ID,
      PROVIDER_ID,
      []
    );
  });

  it("refuses broken hours and a missing provider before the API", async () => {
    expect(
      await saveHoursAction(
        SLUG,
        IDLE,
        form({ providerId: PROVIDER_ID, "hours-0-0-start": "09:00" })
      )
    ).toMatchObject({ kind: "invalid" });
    expect(await saveHoursAction(SLUG, IDLE, form({}))).toMatchObject({
      kind: "invalid",
    });
    expect(replaceHours).not.toHaveBeenCalled();
  });

  it("explains an API overlap refusal", async () => {
    vi.mocked(replaceHours).mockRejectedValue(
      apiError(422, { detail: "Working periods on the same day overlap" })
    );
    expect(
      await saveHoursAction(SLUG, IDLE, form({ providerId: PROVIDER_ID }))
    ).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("overlap"),
    });
  });
});

describe("time off", () => {
  it("refuses a member before any add or remove", async () => {
    org("member");
    expect(await saveTimeOffAction(SLUG, IDLE, form(LEAVE))).toMatchObject({
      status: "error",
      kind: "forbidden",
    });
    expect(
      await removeTimeOffAction(SLUG, EXCEPTION_ID, IDLE, form({}))
    ).toMatchObject({ status: "error", kind: "forbidden" });
    expect(createException).not.toHaveBeenCalled();
    expect(deleteException).not.toHaveBeenCalled();
  });

  it("sends the typed times as UTC on the business clock", async () => {
    vi.mocked(getBusinessTimezone).mockResolvedValue("America/Grenada");
    vi.mocked(createException).mockResolvedValue({} as never);
    expect(await saveTimeOffAction(SLUG, IDLE, form(LEAVE))).toMatchObject({
      status: "success",
      message: "Time off added.",
    });
    // America/Grenada is UTC-4 all year: 09:00 local is 13:00 UTC.
    expect(createException).toHaveBeenCalledWith("tok", ORG_ID, PROVIDER_ID, {
      kind: "time_off",
      starts_at: "2026-11-20T13:00:00.000Z",
      ends_at: "2026-11-20T21:00:00.000Z",
      reason: "Annual leave",
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/studio/${SLUG}/settings`);
  });

  it("refuses an end that is not after the start, without calling the API", async () => {
    vi.mocked(getBusinessTimezone).mockResolvedValue("America/Grenada");
    const result = await saveTimeOffAction(
      SLUG,
      IDLE,
      form({ ...LEAVE, endsAt: "2026-11-20T09:00" })
    );
    expect(result).toMatchObject({
      status: "error",
      kind: "invalid",
      fields: { endsAt: "The end must be after the start." },
    });
    expect(createException).not.toHaveBeenCalled();
  });

  it("names the missing start and a reason that is too long", async () => {
    vi.mocked(getBusinessTimezone).mockResolvedValue("America/Grenada");
    expect(
      await saveTimeOffAction(SLUG, IDLE, form({ ...LEAVE, startsAt: "" }))
    ).toMatchObject({
      fields: { startsAt: "Enter the start as a date and time." },
    });
    expect(
      await saveTimeOffAction(
        SLUG,
        IDLE,
        form({ ...LEAVE, reason: "x".repeat(201) })
      )
    ).toMatchObject({ status: "error", kind: "invalid" });
    expect(createException).not.toHaveBeenCalled();
  });

  it("maps the API's field errors and keeps the form's own message", async () => {
    vi.mocked(getBusinessTimezone).mockResolvedValue("America/Grenada");
    vi.mocked(createException).mockRejectedValue(
      apiError(422, {
        detail: "Validation error",
        errors: [
          {
            type: "value_error",
            loc: ["body", "ends_at"],
            msg: "Value error, ends_at must be after starts_at",
          },
        ],
      })
    );
    expect(await saveTimeOffAction(SLUG, IDLE, form(LEAVE))).toMatchObject({
      status: "error",
      kind: "invalid",
      fields: { endsAt: "The end must be after the start." },
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a server fault from the add", async () => {
    vi.mocked(getBusinessTimezone).mockResolvedValue("America/Grenada");
    const fault = apiError(500);
    vi.mocked(createException).mockRejectedValue(fault);
    expect(await saveTimeOffAction(SLUG, IDLE, form(LEAVE))).toMatchObject({
      status: "error",
      kind: "unavailable",
    });
    expect(reportError).toHaveBeenCalledWith(fault, "studio");
  });

  it("removes one row for the resolved organisation", async () => {
    vi.mocked(deleteException).mockResolvedValue(undefined);
    expect(
      await removeTimeOffAction(SLUG, EXCEPTION_ID, IDLE, form({}))
    ).toMatchObject({ status: "success", message: "Time off removed." });
    expect(deleteException).toHaveBeenCalledWith("tok", ORG_ID, EXCEPTION_ID);
  });

  it("says a row that is already gone no longer exists", async () => {
    vi.mocked(deleteException).mockRejectedValue(
      apiError(404, { detail: "x" })
    );
    expect(
      await removeTimeOffAction(SLUG, EXCEPTION_ID, IDLE, form({}))
    ).toMatchObject({ status: "error", kind: "not_found" });
    expect(reportError).not.toHaveBeenCalled();
  });
});
