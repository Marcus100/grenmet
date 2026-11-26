import type { BookingSettings } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, ORG_ID, session } from "@/test/studio";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(() => Promise.resolve(session)),
}));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock("./../settings/actions", () => ({
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
import ServicesPage from "./page";

const params = Promise.resolve({ orgSlug: "sea-salt" });
const NO_SERVICES = /No services yet/u;
const SETTINGS_LINK = "Business settings";
const NOBODY_DOES =
  /No one is set to do this service, so customers see no times/u;

const SETTINGS: BookingSettings = {
  profile: null,
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
      deposit_minor: 0,
      active: true,
      sort_order: 0,
    },
  ],
  providers: [],
  deposits_available: false,
};

function role(value: "member" | "admin") {
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
});

describe("/studio/[orgSlug]/services", () => {
  it("warns on an active service no person is set to do, with a link to People", async () => {
    vi.mocked(getSettings).mockResolvedValue(SETTINGS);
    render(await ServicesPage({ params }));
    expect(screen.getByText("No one does this")).toBeInTheDocument();
    expect(screen.getByText(NOBODY_DOES)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute(
      "href",
      "/studio/sea-salt/people"
    );
  });

  it("does not warn once an active person does the service", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...SETTINGS,
      providers: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Maya",
          user_id: null,
          active: true,
          sort_order: 0,
          service_ids: ["44444444-4444-4444-8444-444444444444"],
          working_hours: [],
        },
      ],
    });
    render(await ServicesPage({ params }));
    expect(screen.queryByText("No one does this")).toBeNull();
    expect(screen.queryByText(NOBODY_DOES)).toBeNull();
  });

  it("lists the services with a way back to Settings", async () => {
    vi.mocked(getSettings).mockResolvedValue(SETTINGS);
    render(await ServicesPage({ params }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Services" })
    ).toBeInTheDocument();
    expect(screen.getByText("Massage")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SETTINGS_LINK })).toHaveAttribute(
      "href",
      "/studio/sea-salt/settings"
    );
    expect(
      screen.getByRole("button", { name: "Add service" })
    ).toBeInTheDocument();
  });

  it("shows the empty state for a member, with no forms", async () => {
    role("member");
    vi.mocked(getSettings).mockResolvedValue({ ...SETTINGS, services: [] });
    render(await ServicesPage({ params }));
    expect(screen.getByText(NO_SERVICES)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a plain failure with a way back when settings cannot be read", async () => {
    vi.mocked(getSettings).mockRejectedValue(apiError(500));
    render(await ServicesPage({ params }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
