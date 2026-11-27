import type {
  BookingProfilePublic,
  BookingProviderSettings,
  BookingServicePublic,
  BookingSettings,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  servicesNobodyDoes,
  setupDoneCount,
  setupSteps,
} from "./setup-checklist";

const EMPTY: BookingSettings = {
  profile: null,
  services: [],
  providers: [],
  deposits_available: false,
};

// Partial fixtures: only the fields the checklist reads.
const PROFILE = {
  public_slug: "sea-salt",
  display_name: "Sea Salt Spa",
  enabled: true,
  brand_color: null,
  logo_file_id: null,
} as BookingProfilePublic;

const SERVICE = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Massage",
} as BookingServicePublic;

const PERSON = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Maya",
  working_hours: [{ weekday: 0, start_time: "09:00:00", end_time: "17:00:00" }],
} as BookingProviderSettings;

function done(settings: BookingSettings): Record<string, boolean> {
  return Object.fromEntries(
    setupSteps(settings).map((step) => [step.id, step.done])
  );
}

describe("setup steps for a new business", () => {
  it("lists all five steps, none done, when nothing is saved", () => {
    const steps = setupSteps(EMPTY);
    expect(steps.map((step) => step.id)).toEqual([
      "services",
      "hours",
      "address",
      "brand",
      "payments",
    ]);
    expect(setupDoneCount(steps)).toBe(0);
  });
});

describe("each step is read from saved data", () => {
  it("is done for a service once one is saved", () => {
    expect(done({ ...EMPTY, services: [SERVICE] }).services).toBe(true);
  });

  it("is done for hours once a provider has any", () => {
    expect(done({ ...EMPTY, providers: [PERSON] }).hours).toBe(true);
    const idle = { ...PERSON, working_hours: [] };
    expect(done({ ...EMPTY, providers: [idle as never] }).hours).toBe(false);
  });

  it("is done for the address only while the booking page is open", () => {
    expect(done({ ...EMPTY, profile: PROFILE }).address).toBe(true);
    const closed = { ...PROFILE, enabled: false };
    expect(done({ ...EMPTY, profile: closed as never }).address).toBe(false);
  });

  it("is done for the brand with a colour or a logo", () => {
    expect(
      done({
        ...EMPTY,
        profile: { ...PROFILE, brand_color: "#0b63ee" } as never,
      }).brand
    ).toBe(true);
    expect(
      done({
        ...EMPTY,
        profile: {
          ...PROFILE,
          logo_file_id: "6f1c2a3e-1b2c-4d5e-8f90-a1b2c3d4e5f6",
        } as never,
      }).brand
    ).toBe(true);
  });

  it("is done for payments once the profile exists", () => {
    expect(done({ ...EMPTY, profile: PROFILE }).payments).toBe(true);
  });

  it("counts every done step", () => {
    const steps = setupSteps({
      profile: { ...PROFILE, brand_color: "#0b63ee" } as never,
      services: [SERVICE],
      providers: [PERSON],
      deposits_available: true,
    });
    expect(setupDoneCount(steps)).toBe(5);
  });
});

describe("a service no one is set to do", () => {
  const massage = {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Massage",
    active: true,
  } as BookingServicePublic;
  const facial = {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Facial",
    active: true,
  } as BookingServicePublic;
  const maya = {
    ...PERSON,
    active: true,
    service_ids: [massage.id],
  } as BookingProviderSettings;

  it("names the active services no active person does", () => {
    expect([...servicesNobodyDoes([massage, facial], [maya])]).toEqual([
      facial.id,
    ]);
    expect(servicesNobodyDoes([massage], [maya]).size).toBe(0);
  });

  it("does not count a person who is switched off", () => {
    expect([
      ...servicesNobodyDoes([massage], [{ ...maya, active: false }]),
    ]).toEqual([massage.id]);
  });

  it("leaves out a switched-off service and an add-on", () => {
    expect(
      servicesNobodyDoes(
        [
          { ...facial, active: false },
          { ...massage, is_add_on: true },
        ],
        []
      ).size
    ).toBe(0);
  });

  it("adds a step that links to People only while a service has no one", () => {
    const missing = setupSteps({
      ...EMPTY,
      services: [massage, facial],
      providers: [maya],
    });
    const step = missing.find((item) => item.id === "staffed");
    expect(step).toMatchObject({ done: false, target: "people" });
    const complete = setupSteps({
      ...EMPTY,
      services: [massage],
      providers: [maya],
    });
    expect(complete.some((item) => item.id === "staffed")).toBe(false);
  });
});
