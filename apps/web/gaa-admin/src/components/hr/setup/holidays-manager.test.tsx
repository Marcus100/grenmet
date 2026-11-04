import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HolidaysManager } from "./holidays-manager";

const BASE = "http://localhost";
const LOAD_LABEL = /Load provisional \d{4} holidays/u;
const PARTIAL_YEAR_LOAD_LABEL = /Load provisional \d+ holidays/u;
const SAVE_LABEL = /Save changes/u;
const MANAGED_BY_ADMINS = /managed by global roster administrators/u;

const HOLIDAY = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Independence Day",
  holiday_date: "2026-02-07",
  is_recurring: false,
  country_code: "GD",
  source: "provisional - verify with GAA HR",
  needs_verification: true,
  created_by_user_id: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-10-18T00:00:00Z",
};

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/rosters/public-holidays`, () =>
    HttpResponse.json({ data: [HOLIDAY], count: 1 })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderManager(canManage = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HolidaysManager canManage={canManage} />
    </QueryClientProvider>
  );
}

describe("HolidaysManager", () => {
  it("flags provisional rows and edits a date", async () => {
    const puts: Record<string, unknown>[] = [];
    server.use(
      http.put(
        `${BASE}/api/v1/hr/rosters/public-holidays/${HOLIDAY.id}`,
        async ({ request }) => {
          puts.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json(HOLIDAY);
        }
      )
    );
    renderManager();

    await screen.findByText("Independence Day");
    expect(screen.getByText("Verify with HR")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-02-09" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Still needs HR verification" })
    );
    fireEvent.click(screen.getByRole("button", { name: SAVE_LABEL }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({
      name: "Independence Day",
      holiday_date: "2026-02-09",
      needs_verification: false,
    });
  });

  it("loads the provisional calendar for the chosen year", async () => {
    const posts: Record<string, unknown>[] = [];
    server.use(
      http.post(
        `${BASE}/api/v1/hr/rosters/public-holidays/provisional`,
        async ({ request }) => {
          posts.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json(
            { data: [HOLIDAY], count: 1 },
            { status: 201 }
          );
        }
      )
    );
    renderManager();

    await screen.findByText("Independence Day");
    fireEvent.change(screen.getByLabelText("Year"), {
      target: { value: "2027" },
    });
    fireEvent.click(screen.getByRole("button", { name: LOAD_LABEL }));

    await waitFor(() => expect(posts).toEqual([{ year: 2027 }]));
  });

  it("does not ask the API for a year outside 2000-2100", async () => {
    const requestedYears: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/api/v1/hr/rosters/public-holidays`, ({ request }) => {
        const year = new URL(request.url).searchParams.get("year");
        requestedYears.push(year);
        // The API answers 422 for a year it does not accept.
        if (Number(year) < 2000 || Number(year) > 2100) {
          return HttpResponse.json({ detail: "invalid year" }, { status: 422 });
        }
        return HttpResponse.json({ data: [HOLIDAY], count: 1 });
      })
    );
    renderManager();
    await screen.findByText("Independence Day");

    fireEvent.change(screen.getByLabelText("Year"), {
      target: { value: "202" },
    });

    expect(
      await screen.findByText("No holidays recorded for 202.")
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(requestedYears).not.toContain("202");
    expect(
      screen
        .getByRole("button", { name: PARTIAL_YEAR_LOAD_LABEL })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  it("does not ask the API for a decimal year", async () => {
    const requestedYears: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/api/v1/hr/rosters/public-holidays`, ({ request }) => {
        const year = new URL(request.url).searchParams.get("year");
        requestedYears.push(year);
        if (!Number.isInteger(Number(year))) {
          return HttpResponse.json({ detail: "invalid year" }, { status: 422 });
        }
        return HttpResponse.json({ data: [HOLIDAY], count: 1 });
      })
    );
    renderManager();
    await screen.findByText("Independence Day");

    fireEvent.change(screen.getByLabelText("Year"), {
      target: { value: "2026.5" },
    });

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(requestedYears).not.toContain("2026.5");
  });

  it("hides editing controls without roster management", async () => {
    renderManager(false);
    await screen.findByText("Independence Day");
    expect(
      screen.queryByRole("button", { name: "Edit" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: LOAD_LABEL })
    ).not.toBeInTheDocument();
    expect(screen.getByText(MANAGED_BY_ADMINS)).toBeInTheDocument();
  });
});
