import type {
  BookingProviderPublic,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORG_ID, PROVIDER_ID, session } from "@/test/studio";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(() => Promise.resolve(session)),
}));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  getBusinessTimezone: vi.fn(),
  listProviders: vi.fn(),
  listServices: vi.fn(),
}));
vi.mock("@/app/studio/[orgSlug]/bookings/new/actions", () => ({
  createBookingAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import {
  findOrganisation,
  getBusinessTimezone,
  listProviders,
  listServices,
} from "@/lib/studio-api";
import NewBookingPage from "./page";

const params = Promise.resolve({ orgSlug: "sea-salt" });
const S1 = "44444444-4444-4444-8444-444444444444";
const S2 = "44444444-4444-4444-8444-444444444445";
const NEED_ADMIN = /You need admin access/u;
const MASSAGE = /Massage/u;
const FACIAL = /Facial/u;
const NOTHING = /Nothing to book yet/u;

function service(
  id: string,
  name: string,
  active = true
): BookingServicePublic {
  return {
    id,
    name,
    category: null,
    description: null,
    duration_min: 60,
    buffer_before_min: 0,
    buffer_after_min: 0,
    price_minor: 10_000,
    deposit_minor: 0,
    active,
    sort_order: 0,
  };
}

function provider(serviceIds: string[], active = true): BookingProviderPublic {
  return {
    id: PROVIDER_ID,
    name: "Maya",
    user_id: null,
    active,
    sort_order: 0,
    service_ids: serviceIds,
  };
}

function role(value: "member" | "admin") {
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: "sea-salt",
    role: value,
  });
}

beforeEach(() => {
  vi.mocked(getBusinessTimezone).mockResolvedValue("America/Grenada");
  role("admin");
});

describe("new booking page", () => {
  it("tells a member they need admin access", async () => {
    role("member");
    render(await NewBookingPage({ params }));
    expect(screen.getByRole("alert")).toHaveTextContent(NEED_ADMIN);
    expect(listServices).not.toHaveBeenCalled();
  });

  it("explains an empty business and how to fix it", async () => {
    vi.mocked(listServices).mockResolvedValue([service(S1, "Massage")]);
    vi.mocked(listProviders).mockResolvedValue([]);
    render(await NewBookingPage({ params }));
    expect(screen.getByText(NOTHING)).toBeInTheDocument();
  });

  it("offers only active services an active provider covers", async () => {
    vi.mocked(listServices).mockResolvedValue([
      service(S1, "Massage"),
      service(S2, "Facial"),
    ]);
    vi.mocked(listProviders).mockResolvedValue([provider([S1])]);
    render(await NewBookingPage({ params }));
    expect(screen.getByRole("option", { name: MASSAGE })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: FACIAL })
    ).not.toBeInTheDocument();
  });

  it("ignores inactive providers and services", async () => {
    vi.mocked(listServices).mockResolvedValue([service(S1, "Massage", false)]);
    vi.mocked(listProviders).mockResolvedValue([provider([S1], false)]);
    render(await NewBookingPage({ params }));
    expect(screen.getByText(NOTHING)).toBeInTheDocument();
  });
});
