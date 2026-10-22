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
  createProvider: vi.fn(),
  createService: vi.fn(),
  findOrganisation: vi.fn(),
  replaceHours: vi.fn(),
  saveProfile: vi.fn(),
  updateProvider: vi.fn(),
  updateService: vi.fn(),
}));

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
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
  saveHoursAction,
  saveProfileAction,
  saveProviderAction,
  saveServiceAction,
} from "./actions";

const SLUG = "sea-salt";
const IDLE = { status: "idle" } as const;
const SERVICE_ID = "44444444-4444-4444-8444-444444444444";

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
    expect(result).toMatchObject({ status: "done" });
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
      notify_email: null,
      manage_url_template: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/studio/${SLUG}/settings`);
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

describe("services", () => {
  it("creates with money in minor units", async () => {
    vi.mocked(createService).mockResolvedValue({} as never);
    expect(await saveServiceAction(SLUG, IDLE, form(SERVICE))).toMatchObject({
      status: "done",
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
