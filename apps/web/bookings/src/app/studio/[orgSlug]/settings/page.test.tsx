import type { BookingSettings } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORG_ID, PROVIDER_ID, session } from "@/test/studio";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(() => Promise.resolve(session)),
}));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock("./actions", () => ({
  saveHoursAction: vi.fn(),
  saveProfileAction: vi.fn(),
  saveProviderAction: vi.fn(),
  saveServiceAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import { findOrganisation, getSettings } from "@/lib/studio-api";
import SettingsPage from "./page";

const params = Promise.resolve({ orgSlug: "sea-salt" });
const NO_SERVICES = /No services yet/;
const NO_PROVIDERS = /No providers yet/;
const NOT_YET = /Time off, extra hours and menu order/;
const SAVE_PROFILE = "Save profile";
const READ_ONLY = /Ask an owner or admin to change them/;
const NO_PROFILE = /No booking profile yet/;
const ADD_SERVICE = "Add service";
const HOURS = /09:00 to 17:00/;
const SALT_ZONE = /Timezone: America\/Barbados/;

const TTD_LINE = /150 TTD, 25 TTD deposit/;

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
  role("admin");
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
