// @vitest-environment jsdom
// Server HTML is what a browser can submit natively before React hydrates. A
// settings form submits through onSubmit only, so its Save button must be
// disabled in that HTML; otherwise a native submit would send the typed values
// to a GET URL. The real useHydrated() runs here (no mock), so these tests fail
// when the guard is removed.
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/[orgSlug]/settings/actions", () => ({
  saveHoursAction: vi.fn(),
  saveProfileAction: vi.fn(),
  saveProviderAction: vi.fn(),
  saveServiceAction: vi.fn(),
}));

import { HoursForm } from "./hours-form";
import { ProfileForm } from "./profile-form";
import { ProviderForm } from "./provider-form";
import { ServiceForm } from "./service-form";

function submitInServerHtml(element: React.ReactElement) {
  const holder = document.createElement("div");
  holder.innerHTML = renderToString(element);
  const buttons = holder.querySelectorAll<HTMLButtonElement>(
    'button[type="submit"]'
  );
  expect(buttons).toHaveLength(1);
  return buttons[0];
}

describe("settings forms in server HTML", () => {
  it("profile: Save is disabled before hydration", () => {
    const button = submitInServerHtml(
      <ProfileForm orgSlug="sea-salt" profile={null} suggestedName="Sea Salt" />
    );
    expect(button?.disabled).toBe(true);
  });

  it("service: Save is disabled before hydration", () => {
    const button = submitInServerHtml(
      <ServiceForm
        currency="XCD"
        depositsAvailable={false}
        orgSlug="sea-salt"
      />
    );
    expect(button?.disabled).toBe(true);
  });

  it("provider: Save is disabled before hydration", () => {
    const button = submitInServerHtml(
      <ProviderForm orgSlug="sea-salt" services={[]} />
    );
    expect(button?.disabled).toBe(true);
  });

  it("hours: Save is disabled before hydration", () => {
    const button = submitInServerHtml(
      <HoursForm
        hours={[]}
        orgSlug="sea-salt"
        providerId="p"
        zone="America/Grenada"
      />
    );
    expect(button?.disabled).toBe(true);
  });
});

describe("settings form submit after hydration", () => {
  it("is enabled once the form is client-rendered (hydrated)", () => {
    render(
      <ProfileForm orgSlug="sea-salt" profile={null} suggestedName="Sea Salt" />
    );
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
  });
});
