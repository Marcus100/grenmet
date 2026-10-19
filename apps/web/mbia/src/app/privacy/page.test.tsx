import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PrivacyPage from "./page";

const TURNSTILE = /Cloudflare Turnstile/;
const TWENTY_FOUR = /24 months/;

it("states the retention periods and the Turnstile processing", () => {
  render(<PrivacyPage />);
  expect(screen.getByText(TURNSTILE)).toBeTruthy();
  expect(screen.getAllByText(TWENTY_FOUR).length).toBeGreaterThan(0);
});
