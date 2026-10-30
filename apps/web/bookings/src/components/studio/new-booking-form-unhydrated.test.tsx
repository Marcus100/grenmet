// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The hook is stubbed so the guard can be tested on its own. The idempotency
// key is set in an effect, so after mount it exists even before hydration;
// only the useHydrated() guard keeps Save off then. The real hook is covered
// by src/lib/use-hydrated.test.tsx.
const hydration = vi.hoisted(() => ({ hydrated: false }));
vi.mock("@/lib/use-hydrated", () => ({
  useHydrated: () => hydration.hydrated,
}));

vi.mock("@/app/studio/[orgSlug]/bookings/new/actions", () => ({
  createBookingAction: vi.fn(),
}));

import { NewBookingForm } from "./new-booking-form";

const UUID = /^[0-9a-f-]{36}$/;
const S1 = "44444444-4444-4444-8444-444444444444";

const service = {
  id: S1,
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
};

const provider = {
  id: "p1",
  name: "Maya",
  user_id: null,
  active: true,
  sort_order: 0,
  service_ids: [S1],
};

function form(providers: (typeof provider)[]) {
  return (
    <NewBookingForm
      orgSlug="sea-salt"
      providers={providers}
      services={[service]}
      today="2026-10-21"
      zone="America/Grenada"
    />
  );
}

function submitInServerHtml(providers: (typeof provider)[]) {
  const holder = document.createElement("div");
  holder.innerHTML = renderToString(form(providers));
  return holder.querySelector<HTMLButtonElement>('button[type="submit"]');
}

describe("server HTML", () => {
  it("has a disabled Save button, so no native GET carries customer details", () => {
    expect(submitInServerHtml([])?.disabled).toBe(true);
  });

  it("stays disabled with a provider who offers the service", () => {
    expect(submitInServerHtml([provider])?.disabled).toBe(true);
  });
});

describe("the useHydrated guard", () => {
  it("keeps Save disabled after mount while unhydrated, even with the key set", () => {
    hydration.hydrated = false;
    render(form([provider]));
    const key = document.querySelector<HTMLInputElement>(
      'input[name="idempotencyKey"]'
    );
    expect(key?.value).toMatch(UUID);
    expect(screen.getByRole("button", { name: "Save booking" })).toBeDisabled();
  });

  it("enables Save after mount once hydrated, with a provider who offers the service", () => {
    hydration.hydrated = true;
    render(form([provider]));
    expect(screen.getByRole("button", { name: "Save booking" })).toBeEnabled();
  });
});
