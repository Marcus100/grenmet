import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fieldLabel, RecordHistory } from "./record-history";

const NEW_VALUE = /British/;
const EMPTY_HISTORY = /No changes recorded yet/;
const BY_ACTOR = /by Hana Ross/;

const BASE = "http://localhost";

const server = setupServer();

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderHistory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RecordHistory entityId="u1" entityType="employee" />
    </QueryClientProvider>
  );
}

describe("RecordHistory", () => {
  it("shows who changed what, hiding masked values", async () => {
    server.use(
      http.get(`${BASE}/api/v1/audit/employee/u1`, () =>
        HttpResponse.json({
          data: [
            {
              id: "a1",
              record_type: "user_profile",
              record_label: "Profile",
              record_id: "p1",
              action: "update",
              actor_user_id: "hr1",
              actor_name: "Hana Ross",
              changes: [
                {
                  field: "nationality",
                  old: "Grenadian",
                  new: "British",
                  masked: false,
                },
                { field: "phone", old: null, new: null, masked: true },
              ],
              created_at: "2026-09-20T14:05:00Z",
            },
          ],
          count: 1,
          page: 1,
          size: 50,
          total_pages: 1,
        })
      )
    );
    renderHistory();

    expect(await screen.findByText("Changed Profile")).toBeInTheDocument();
    expect(screen.getByText(BY_ACTOR)).toBeInTheDocument();
    expect(screen.getByText("Grenadian")).toBeInTheDocument();
    expect(screen.getByText(NEW_VALUE)).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();
  });

  it("explains an empty history", async () => {
    server.use(
      http.get(`${BASE}/api/v1/audit/employee/u1`, () =>
        HttpResponse.json({
          data: [],
          count: 0,
          page: 1,
          size: 50,
          total_pages: 1,
        })
      )
    );
    renderHistory();
    expect(await screen.findByText(EMPTY_HISTORY)).toBeInTheDocument();
  });

  it("does not leak detail when access is denied", async () => {
    server.use(
      http.get(`${BASE}/api/v1/audit/employee/u1`, () =>
        HttpResponse.json({ detail: "nope" }, { status: 403 })
      )
    );
    renderHistory();
    expect(
      await screen.findByText("History is not available for this record.")
    ).toBeInTheDocument();
  });
});

describe("fieldLabel", () => {
  it("humanises column names", () => {
    expect(fieldLabel("start_date")).toBe("Start date");
    expect(fieldLabel("acting_officer_id")).toBe("Acting officer");
  });
});
