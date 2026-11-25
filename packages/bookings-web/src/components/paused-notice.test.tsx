import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PausedNotice } from "./paused-notice";

const NOT_SAVED = /not saved/u;
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

describe("PausedNotice swapped in mid-flow", () => {
  it("is announced, takes focus and says nothing was booked or saved", () => {
    render(
      <PausedNotice
        businessName="Babydoll"
        contact={NONE}
        Heading="h3"
        swapped
      />
    );
    expect(screen.getByRole("status")).toBeVisible();
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveFocus();
    expect(
      screen.getByText(
        "Your booking was not made and your details were not saved."
      )
    ).toBeVisible();
  });

  it("stays quiet on the storefront page", () => {
    render(<PausedNotice businessName="Babydoll" contact={NONE} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(NOT_SAVED)).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).not.toHaveFocus();
  });
});
