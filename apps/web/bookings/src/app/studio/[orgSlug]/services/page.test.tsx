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
const NO_PEOPLE = /so customers can see times/u;
const NOBODY_DOES =
  /Nobody is set to do this, so customers see no times for it/u;

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

const SERVICE = SETTINGS.services[0] as BookingSettings["services"][number];
const OTHER_ID = "55555555-5555-4555-8555-555555555555";
const MAYA: BookingSettings["providers"][number] = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Maya",
  user_id: null,
  active: true,
  sort_order: 0,
  service_ids: [SERVICE.id],
  working_hours: [],
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
  it("shows one notice, and no badge on each service, when there is no active person", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...SETTINGS,
      services: [SERVICE, { ...SERVICE, id: OTHER_ID, name: "Facial" }],
      providers: [{ ...MAYA, active: false }],
    });
    render(await ServicesPage({ params }));
    expect(
      screen.getByRole("link", { name: "People" }).parentElement
    ).toHaveTextContent(
      "Add a person under People so customers can see times."
    );
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute(
      "href",
      "/studio/sea-salt/people"
    );
    expect(screen.queryByText("No one does this")).toBeNull();
    expect(screen.queryByText(NOBODY_DOES)).toBeNull();
  });

  it("badges only the service no one does when there is an active person", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...SETTINGS,
      services: [SERVICE, { ...SERVICE, id: OTHER_ID, name: "Facial" }],
      providers: [MAYA],
    });
    render(await ServicesPage({ params }));
    expect(screen.getAllByText("No one does this")).toHaveLength(1);
    expect(screen.getByText(NOBODY_DOES)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute(
      "href",
      "/studio/sea-salt/people"
    );
    expect(screen.queryByText(NO_PEOPLE)).toBeNull();
  });

  it("does not warn once an active person does the service", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...SETTINGS,
      providers: [MAYA],
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
