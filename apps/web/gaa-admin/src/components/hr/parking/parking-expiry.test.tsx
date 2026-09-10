import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { ParkingExpiry } from "./parking-expiry";

const server = setupServer();
beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ParkingExpiry />
    </QueryClientProvider>
  );
}
it("shows insurance warnings, does not treat an unissued decal as valid, and paginates", async () => {
  const pages: string[] = [];
  server.use(
    http.get("http://localhost/api/v1/hr/parking-permits", ({ request }) => {
      const url = new URL(request.url);
      const page = url.searchParams.get("page") ?? "1";
      pages.push(page);
      expect(url.searchParams.has("department_id")).toBe(false);
      return HttpResponse.json({
        count: 21,
        data: [
          {
            id: page,
            vehicle_registration_no: page === "1" ? "P100" : "P200",
            status: "SUBMITTED",
            vehicle_insurance_expiry_date: "2020-01-01",
            valid_to: "2099-01-01",
            issued_at: null,
          },
        ],
      });
    })
  );
  show();
  expect(await screen.findByText("P100")).toBeVisible();
  expect(screen.getByText("Expired", { selector: "span" })).toBeVisible();
  expect(screen.getByText("Decal not issued")).toBeVisible();
  expect(screen.queryByText("Current")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Expiry filter (current page)"), {
    target: { value: "current" },
  });
  expect(
    screen.getByText("No parking permits match on this page.")
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText("Expiry filter (current page)"), {
    target: { value: "all" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("P200")).toBeVisible();
  expect(pages).toEqual(["1", "2"]);
});
it("shows read failures with an access error", async () => {
  server.use(
    http.get("http://localhost/api/v1/hr/parking-permits", () =>
      HttpResponse.json({}, { status: 403 })
    )
  );
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to load parking permits."
  );
});
