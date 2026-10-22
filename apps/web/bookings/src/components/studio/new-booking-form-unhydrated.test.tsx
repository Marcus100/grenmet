// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/studio/[orgSlug]/bookings/new/actions", () => ({
  createBookingAction: vi.fn(),
}));

import { NewBookingForm } from "./new-booking-form";

it("server HTML has a disabled Save button, so no native GET carries customer details", () => {
  const html = renderToString(
    <NewBookingForm
      orgSlug="sea-salt"
      providers={[]}
      services={[]}
      today="2026-10-21"
      zone="America/Grenada"
    />
  );
  const holder = document.createElement("div");
  holder.innerHTML = html;
  expect(
    holder.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled
  ).toBe(true);
});
