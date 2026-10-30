import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PrivacyPage from "./page";

const TURNSTILE = /Cloudflare Turnstile/u;
const THIRTY = /30 days/u;

it("states the retention periods and the Turnstile processing", () => {
  render(<PrivacyPage />);
  expect(screen.getByRole("heading", { name: "Privacy" })).toBeTruthy();
  expect(screen.getByText(TURNSTILE)).toBeTruthy();
  expect(screen.getByText(THIRTY)).toBeTruthy();
});
