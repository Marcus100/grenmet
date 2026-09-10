// @vitest-environment jsdom
import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import UserProfileContent from "./UserProfileContent";

const BASE = "http://localhost";

const PROFILE = {
  id: "staff",
  identity: { username: "staff", email: "staff@example.com", status: "ACTIVE" },
  profile: { first_name: "Test", last_name: "Staff" },
  address: { line_1: "Old Road", country: "Grenada" },
  emergency_contact: {},
  employment: {},
  roster_preferences: {},
  leave: {},
  approval_authority: {},
  audit: {},
};

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/profile/me`, () => HttpResponse.json(PROFILE))
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserProfileContent />
    </QueryClientProvider>
  );
}

describe("UserProfileContent tabs", () => {
  it("splits the profile into Overview, Personal, Employment and Documents", async () => {
    renderProfile();

    expect(await screen.findByRole("tab", { name: "Overview" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Personal" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Employment" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Documents" })).toBeVisible();
  }, 20_000);

  it("opens Overview first and switches on click", async () => {
    renderProfile();

    const overview = await screen.findByRole("tab", { name: "Overview" });
    expect(overview).toHaveAttribute("aria-selected", "true");

    const personal = screen.getByRole("tab", { name: "Personal" });
    fireEvent.click(personal);
    expect(personal).toHaveAttribute("aria-selected", "true");
    expect(overview).toHaveAttribute("aria-selected", "false");
  }, 20_000);
});
