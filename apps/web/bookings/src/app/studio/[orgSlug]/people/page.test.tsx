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
vi.mock("../settings/actions", () => ({
  saveProviderAction: vi.fn(),
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
import PeoplePage from "./page";

const params = Promise.resolve({ orgSlug: "sea-salt" });
const NO_PROVIDERS = /No providers yet/u;

const SETTINGS: BookingSettings = {
  profile: null,
  services: [],
  providers: [
    {
      id: PROVIDER_ID,
      name: "Maya",
      user_id: null,
      active: true,
      sort_order: 0,
      service_ids: [],
      working_hours: [],
    },
  ],
  deposits_available: false,
};

function role(value: "member" | "owner") {
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: "sea-salt",
    role: value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/studio/[orgSlug]/people", () => {
  it("lists the people with a form to add one, for an owner", async () => {
    role("owner");
    vi.mocked(getSettings).mockResolvedValue(SETTINGS);
    render(await PeoplePage({ params }));
    expect(
      screen.getByRole("heading", { level: 1, name: "People" })
    ).toBeInTheDocument();
    expect(screen.getByText("Maya")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add provider" })
    ).toBeInTheDocument();
  });

  it("shows the empty state, with no forms, for a member", async () => {
    role("member");
    vi.mocked(getSettings).mockResolvedValue({ ...SETTINGS, providers: [] });
    render(await PeoplePage({ params }));
    expect(screen.getByText(NO_PROVIDERS)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
