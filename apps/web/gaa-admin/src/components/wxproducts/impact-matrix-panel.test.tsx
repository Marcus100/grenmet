import { configureApiClient } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { ImpactMatrixPanel } from "./impact-matrix-panel";

const RE_BE_AWARE_LOW_LIKELIHOOD_MINOR_ =
  /Be aware: Low likelihood, Minor impact/u;
const RE_NO_APPROVED_HAZARD_LIBRARY_ENT =
  /No approved hazard library entry yet/u;
const RE_COULD_NOT_BE_READ = /could not be read/u;

const server = setupServer(
  http.get("http://localhost/api/v1/cap/ibf/suggest", ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      colour: "yellow",
      meaning: "Be aware",
      likelihood: url.searchParams.get("likelihood"),
      impact: url.searchParams.get("impact"),
      percent: 30,
      severity: "Moderate",
      awareness_level: "2; yellow; Moderate",
      available: false,
    });
  })
);
beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("asks for the answers while likelihood or impact is missing", () => {
  render(<ImpactMatrixPanel kind="flood" />);
  expect(
    screen.getByRole("region", { name: "Impact matrix suggestion" })
  ).toHaveTextContent("Choose a likelihood and an impact level");
});

it("shows the suggested colour and that the standard grid is used", async () => {
  render(<ImpactMatrixPanel impact="Minor" kind="flood" likelihood="Low" />);
  expect(await screen.findByTestId("suggested-colour")).toHaveTextContent(
    "Yellow"
  );
  expect(screen.getByText(RE_BE_AWARE_LOW_LIKELIHOOD_MINOR_)).toBeVisible();
  expect(screen.getByText(RE_NO_APPROVED_HAZARD_LIBRARY_ENT)).toBeVisible();
});

it("says so when the matrix cannot be read", async () => {
  server.use(
    http.get("http://localhost/api/v1/cap/ibf/suggest", () =>
      HttpResponse.json({ detail: "no" }, { status: 403 })
    )
  );
  render(<ImpactMatrixPanel impact="Minor" kind="flood" likelihood="Low" />);
  expect(await screen.findByText(RE_COULD_NOT_BE_READ)).toBeVisible();
});
