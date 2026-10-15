import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { RosterRulesManager } from "./roster-rules-manager";

const BASE = "http://localhost";
const RULES_URL = `${BASE}/api/v1/hr/rosters/departments/dept_met/rules`;
const SAVE_LABEL = /Save rules/;
const REST_LABEL = /Minimum rest/;
const CONSECUTIVE_LABEL = /Maximum consecutive/;

let saved: unknown;
const server = setupServer(
  http.get(`${BASE}/api/v1/hr/departments`, () =>
    HttpResponse.json({
      data: [{ id: "dept_met", name: "Meteorological Department" }],
      count: 1,
    })
  ),
  http.get(RULES_URL, () => HttpResponse.json({ department_id: "dept_met" })),
  http.put(RULES_URL, async ({ request }) => {
    saved = await request.json();
    return HttpResponse.json({ department_id: "dept_met" });
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  saved = undefined;
});
afterAll(() => server.close());

function renderManager(canManage = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RosterRulesManager canManage={canManage} organisationId="gaa" />
    </QueryClientProvider>
  );
}

describe("RosterRulesManager", () => {
  it("saves entered limits and sends null for blank rules", async () => {
    renderManager();
    const rest = await screen.findByLabelText(REST_LABEL);
    expect(screen.getByRole("button", { name: SAVE_LABEL })).toBeDisabled();
    fireEvent.change(rest, { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_LABEL }));
    await waitFor(() =>
      expect(saved).toEqual({
        min_rest_hours: 11,
        max_consecutive_days: null,
        max_weekly_hours: null,
      })
    );
  });

  it("rejects an out-of-range value before calling the API", async () => {
    renderManager();
    const consecutive = await screen.findByLabelText(CONSECUTIVE_LABEL);
    fireEvent.change(consecutive, { target: { value: "0" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("1 to 31");
    expect(screen.getByRole("button", { name: SAVE_LABEL })).toBeDisabled();
    expect(saved).toBeUndefined();
  });

  it("is read only without roster.manage", async () => {
    renderManager(false);
    expect(await screen.findByLabelText(REST_LABEL)).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: SAVE_LABEL })
    ).not.toBeInTheDocument();
  });
});
