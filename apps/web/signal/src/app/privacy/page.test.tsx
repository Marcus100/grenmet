import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PrivacyPage from "./page";

const TURNSTILE = /Cloudflare Turnstile/u;
const THIRTY = /deleted after 30 days/u;

it("states the retention periods and the Turnstile processing", () => {
  render(<PrivacyPage />);
  expect(screen.getByText(TURNSTILE)).toBeTruthy();
  expect(screen.getByText(THIRTY)).toBeTruthy();
});
