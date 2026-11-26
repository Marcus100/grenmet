import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PausedBanner } from "./paused-banner";

const CUSTOMERS_CANT = /Customers can't book online right now/u;
const STILL_STAND = /Bookings that already stand still stand/u;
const CAN_RENEW = /An owner or admin can renew on Plan & billing/u;

describe("PausedBanner", () => {
  it("says what still works and links an owner or admin to Plan & billing", () => {
    render(<PausedBanner canManage orgSlug="sea-salt" />);
    expect(screen.getByText("Online booking is paused")).toBeVisible();
    expect(screen.getByText(CUSTOMERS_CANT)).toBeVisible();
    expect(screen.getByText(STILL_STAND)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Plan & billing" })
    ).toHaveAttribute("href", "/studio/sea-salt/plan");
  });

  it("gives a member no link, only who can renew", () => {
    render(<PausedBanner canManage={false} orgSlug="sea-salt" />);
    expect(screen.queryByRole("link", { name: "Plan & billing" })).toBeNull();
    expect(screen.getByText(CAN_RENEW)).toBeVisible();
  });
});
