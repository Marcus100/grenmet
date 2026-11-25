import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PausedNotice } from "./paused-notice";

const NONE = { phone: null, whatsapp: null, instagram: null, email: null };

describe("PausedNotice", () => {
  it("names the business and lists its contact options", () => {
    render(
      <PausedNotice
        businessName="Babydoll Beauty Bar"
        contact={{ ...NONE, phone: "+14735551234", email: "hi@example.com" }}
      />
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Babydoll Beauty Bar is not taking online bookings right now",
      })
    ).toBeVisible();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("asks people to check back when the business set no contact options", () => {
    render(<PausedNotice businessName="Babydoll Beauty Bar" contact={NONE} />);
    expect(screen.getByText("Please check back later.")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("uses a lower heading under another heading and a fallback name", () => {
    render(<PausedNotice businessName="" contact={NONE} Heading="h3" />);
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "This business is not taking online bookings right now",
      })
    ).toBeVisible();
  });
});
