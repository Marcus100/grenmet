import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { StaffOnly } from "@/components/staff-only";
import { StatusCard } from "@/components/status-card";

const EMAIL_TEXT = /resident@example\.com/u;

it("refuses non-staff clearly and offers only sign-out", () => {
  render(<StaffOnly email="resident@example.com" />);
  expect(
    screen.getByRole("heading", { name: "Barrels staff only" })
  ).toBeTruthy();
  expect(screen.getByText(EMAIL_TEXT)).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Organisations" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Sign out of this console" })
  ).toBeTruthy();
});

it("writes the status out instead of relying on colour", () => {
  render(
    <StatusCard
      card={{
        id: "api-readiness",
        title: "API and database",
        tone: "down",
        summary: "Not ready",
        detail: "The database is unreachable or its schema is out of date.",
      }}
    />
  );
  expect(screen.getByText("Not ready")).toBeTruthy();
  expect(screen.getByText("Problem")).toBeTruthy();
});
