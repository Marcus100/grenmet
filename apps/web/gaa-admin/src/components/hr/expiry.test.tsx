import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ExpiryBadge, expiryState, grenadaToday } from "./expiry";

it("uses the Grenada calendar day at UTC midnight", () => {
  expect(grenadaToday(new Date("2026-09-11T02:00:00Z"))).toBe("2026-09-10");
});
it("separates expired, due today, 30-day and unknown dates", () => {
  const today = "2026-09-10";
  expect(expiryState("2026-09-09", today)).toBe("expired");
  expect(expiryState(today, today)).toBe("soon");
  expect(expiryState("2026-10-10", today)).toBe("soon");
  expect(expiryState("2026-10-11", today)).toBe("current");
  expect(expiryState(null, today)).toBe("undated");
  expect(expiryState("invalid", today)).toBe("undated");
});
it("does not display archived documents as current expiry warnings", () => {
  render(<ExpiryBadge archived date="2020-01-01" today="2026-09-10" />);
  expect(screen.getByText("Archived")).toBeVisible();
  expect(screen.queryByText("Expired")).not.toBeInTheDocument();
});
