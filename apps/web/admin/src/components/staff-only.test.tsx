import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { StaffOnly } from "@/components/staff-only";
import { StatusCard } from "@/components/status-card";

const EMAIL_TEXT = /resident@example\.com/u;

it("refuses non-staff, shows the signed-in account and offers the way out", () => {
  render(<StaffOnly email="resident@example.com" />);
  expect(
    screen.getByRole("heading", { name: "Barrels staff only" })
  ).toBeTruthy();
  expect(screen.getByText(EMAIL_TEXT)).toBeTruthy();
  const address = screen.getByText("resident@example.com", {
    selector: "span",
  });
  expect(address.parentElement?.textContent).toBe(
    "You are signed in as resident@example.com, and that account does not have access."
  );
  expect(screen.getByRole("heading", { name: "Who to ask" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Organisations" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Switch account" }).getAttribute("type")
  ).toBe("submit");
  expect(
    screen
      .getByRole("link", { name: "Go to your account" })
      .getAttribute("href")
  ).toBeTruthy();
});

it("still explains the refusal when the email is not known", () => {
  render(<StaffOnly />);
  expect(
    screen.getByText("The account you are signed in with does not have access.")
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
