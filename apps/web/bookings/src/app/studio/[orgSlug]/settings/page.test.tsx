import type { BookingSettings } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, ORG_ID, PROVIDER_ID, session } from "@/test/studio";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(() => Promise.resolve(session)),
}));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  getSettings: vi.fn(),
  listExceptions: vi.fn(),
}));
vi.mock("./actions", () => ({
  removeTimeOffAction: vi.fn(),
  saveHoursAction: vi.fn(),
  saveProfileAction: vi.fn(),
  saveProviderAction: vi.fn(),
  saveServiceAction: vi.fn(),
  saveTimeOffAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import { reportError } from "@/lib/report-error";
import {
  findOrganisation,
  getSettings,
  listExceptions,
} from "@/lib/studio-api";
import SettingsPage from "./page";

const params = Promise.resolve({ orgSlug: "sea-salt" });
const NO_SERVICES = /No services yet/u;
const NO_PROVIDERS = /No providers yet/u;
const NOT_YET = /Extra hours and menu order/u;
const NO_TIME_OFF = /No time off planned/u;
const TIME_OFF_ROW = /Time off: .*9:00/u;
const TIME_OFF_REASON = /annual leave/u;
const TIME_OFF_ID = "55555555-5555-4555-8555-555555555555";
const SAVE_PROFILE = "Save profile";
const READ_ONLY = /Ask an owner or admin to change them/u;
const NO_PROFILE = /No booking profile yet/u;
const ADD_SERVICE = "Add service";
const HOURS = /09:00 to 17:00/u;
const SALT_ZONE = /Timezone: America\/Barbados/u;

const TTD_LINE = /TTD 150, TTD 25 deposit/u;

const EMPTY: BookingSettings = {
  profile: null,
  services: [],
  providers: [],
  deposits_available: true,
};

const FULL: BookingSettings = {
  profile: {
    id: "x",
    organisation_id: ORG_ID,
    created_at: "",
    updated_at: "",
    public_slug: "sea-salt",
    display_name: "Sea Salt Spa",
    enabled: true,
    timezone: "America/Barbados",
    currency: "XCD",
    slot_step_min: 30,
    lead_time_min: 120,
    horizon_days: 60,
    cancel_cutoff_hours: 24,
    requires_confirmation: false,
  } as never,
  services: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Massage",
      category: null,
      description: null,
      duration_min: 60,
      buffer_before_min: 0,
      buffer_after_min: 0,
      price_minor: 15_000,
      deposit_minor: 2500,
      active: true,
      sort_order: 0,
    },
  ],
  providers: [
    {
      id: PROVIDER_ID,
      name: "Maya",
      user_id: null,
      active: true,
      sort_order: 0,
      service_ids: ["44444444-4444-4444-8444-444444444444"],
      working_hours: [
        { weekday: 0, start_time: "09:00:00", end_time: "17:00:00" },
      ],
    },
  ],
  deposits_available: true,
};

function role(value: "member" | "admin" | "owner") {
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: "sea-salt",
    role: value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  role("admin");
  vi.mocked(listExceptions).mockResolvedValue([]);
});

describe("settings page", () => {
  it("shows every empty section with what to do, for an admin", async () => {
    vi.mocked(getSettings).mockResolvedValue(EMPTY);
    render(await SettingsPage({ params }));
    expect(screen.getByText(NO_SERVICES)).toBeInTheDocument();
    expect(screen.getByText(NO_PROVIDERS)).toBeInTheDocument();
    expect(screen.getByText(NOT_YET)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: SAVE_PROFILE })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ADD_SERVICE })
    ).toBeInTheDocument();
  });

  it("shows the saved timezone and the provider's hours form to an owner", async () => {
    role("owner");
    vi.mocked(getSettings).mockResolvedValue(FULL);
    render(await SettingsPage({ params }));
    expect(screen.getByText(SALT_ZONE)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save weekly hours" })
    ).toBeInTheDocument();
  });

  it("gives a member a read-only view with no forms", async () => {
    role("member");
    vi.mocked(getSettings).mockResolvedValue(FULL);
    render(await SettingsPage({ params }));
    expect(screen.getByText(READ_ONLY)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(HOURS)).toBeInTheDocument();
  });

  it("lists each provider's time off, with the empty state when there is none", async () => {
    vi.mocked(getSettings).mockResolvedValue(FULL);
    vi.mocked(listExceptions).mockResolvedValue([
      {
        id: TIME_OFF_ID,
        provider_id: PROVIDER_ID,
        kind: "time_off",
        // 13:00 UTC is 09:00 in America/Barbados (UTC-4, no daylight saving).
        starts_at: "2026-11-20T13:00:00Z",
        ends_at: "2026-11-20T21:00:00Z",
        reason: "annual leave",
      },
    ]);
    render(await SettingsPage({ params }));
    expect(screen.getByText(TIME_OFF_ROW)).toBeInTheDocument();
    expect(screen.getByText(TIME_OFF_REASON)).toBeInTheDocument();
    expect(screen.queryByText(NO_TIME_OFF)).not.toBeInTheDocument();
    expect(listExceptions).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      PROVIDER_ID,
      expect.any(String)
    );
  });

  it("keeps the empty profile state visible for a member", async () => {
    role("member");
    vi.mocked(getSettings).mockResolvedValue(EMPTY);
    render(await SettingsPage({ params }));
    expect(screen.getByText(NO_PROFILE)).toBeInTheDocument();
    expect(screen.getByText(NO_SERVICES)).toBeInTheDocument();
  });
});

describe("service summary currency", () => {
  it("uses the business currency code, not a dollar sign", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...FULL,
      profile: { ...FULL.profile, currency: "TTD" } as never,
    });
    render(await SettingsPage({ params }));
    expect(screen.getByText(TTD_LINE)).toBeInTheDocument();
  });
});

describe("time off fails soft per provider", () => {
  const SECOND_PROVIDER = "66666666-6666-4666-8666-666666666666";
  const TWO = {
    ...FULL,
    providers: [
      ...FULL.providers,
      {
        id: SECOND_PROVIDER,
        name: "Jo",
        user_id: null,
        active: true,
        sort_order: 1,
        service_ids: [],
        working_hours: [],
      },
    ],
  } as BookingSettings;

  it("blanks only the failing provider's time off and keeps the rest of Settings usable", async () => {
    role("owner");
    vi.mocked(getSettings).mockResolvedValue(TWO);
    const fault = apiError(500);
    vi.mocked(listExceptions).mockImplementation((_token, _org, providerId) => {
      if (providerId === PROVIDER_ID) {
        return Promise.reject(fault);
      }
      return Promise.resolve([
        {
          id: TIME_OFF_ID,
          provider_id: SECOND_PROVIDER,
          kind: "time_off",
          starts_at: "2026-11-20T13:00:00Z",
          ends_at: "2026-11-20T21:00:00Z",
          reason: "annual leave",
        },
      ]);
    });

    render(await SettingsPage({ params }));

    // The failing provider's section says so; the other provider's row loads.
    expect(
      screen.getByText("Time off could not be loaded. Try again later.")
    ).toBeInTheDocument();
    expect(screen.getByText(TIME_OFF_REASON)).toBeInTheDocument();
    // Only the failing provider is blanked, and the server fault is reported once.
    expect(
      screen.getAllByText("Time off could not be loaded. Try again later.")
    ).toHaveLength(1);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(fault, "studio");
    // The rest of Settings still renders and can be saved.
    expect(screen.queryByText(NO_PROVIDERS)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: SAVE_PROFILE })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Save weekly hours" })
    ).toHaveLength(2);
  });
});
