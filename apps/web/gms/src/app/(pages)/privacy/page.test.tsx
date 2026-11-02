import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PrivacyPage from "./page";

const DATA_REQUEST_FIELDS = /name, email address and organisation/;

it("says what each sign-up, the data request and analytics keep", () => {
  render(<PrivacyPage />);
  for (const heading of [
    "Email alerts",
    "Browser notifications",
    "Climate newsletter by email",
    "Climate data requests",
    "Analytics",
    "Preferences saved in your browser",
    "Error reports",
  ]) {
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  }
  expect(screen.getByText(DATA_REQUEST_FIELDS)).toBeInTheDocument();
});

it("offers the cookie settings from the analytics section", () => {
  render(<PrivacyPage />);
  expect(
    screen.getByRole("button", { name: "Cookie settings" })
  ).toBeInTheDocument();
});
