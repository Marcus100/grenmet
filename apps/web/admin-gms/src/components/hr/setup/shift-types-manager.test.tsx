import { configureApiClient } from "@grenmet/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ShiftTypesManager } from "./shift-types-manager";

const BASE = "http://localhost";
const NEW_SHIFT_LABEL = /New shift type/;
const CREATE_LABEL = /^Create$/;

const SHIFTS = {
  data: [
    {
      code: "M",
      label: "Morning",
      category: "WORK",
      start_time: "05:30",
      end_time: "14:00",
      ends_next_day: false,
      counts_as_work_hours: true,
      needs_reason: false,
      needs_approval: false,
      is_active: true,
    },
    {
      code: "OLD",
      label: "Retired shift",
      category: "OFF",
      start_time: null,
      end_time: null,
      ends_next_day: false,
      counts_as_work_hours: false,
      needs_reason: false,
      needs_approval: false,
      is_active: false,
    },
  ],
  count: 2,
};

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/rosters/shifts`, () => HttpResponse.json(SHIFTS))
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderManager() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShiftTypesManager />
    </QueryClientProvider>
  );
}

describe("ShiftTypesManager", () => {
  it("lists shift types with times and active/inactive status", async () => {
    renderManager();

    expect(await screen.findByText("Morning")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("05:30–14:00")).toBeInTheDocument();

    // Deactivated shifts still show (management view) with an Inactive badge.
    expect(screen.getByText("Retired shift")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  }, 20_000);

  it("creates a shift type, sending category-derived flags", async () => {
    const posted: Record<string, unknown>[] = [];
    server.use(
      http.get(`${BASE}/api/v1/hr/rosters/shifts`, () =>
        HttpResponse.json({ data: [], count: 0 })
      ),
      http.post(`${BASE}/api/v1/hr/rosters/shifts`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posted.push(body);
        return HttpResponse.json({ ...body, is_active: true }, { status: 201 });
      })
    );

    renderManager();

    fireEvent.click(
      await screen.findByRole("button", { name: NEW_SHIFT_LABEL })
    );
    fireEvent.change(await screen.findByLabelText("Code"), {
      target: { value: "N" },
    });
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Night" },
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE_LABEL }));

    await waitFor(() => expect(posted).toHaveLength(1));
    // WORK (the default category) derives counts_as_work_hours=true, others false.
    expect(posted[0]).toMatchObject({
      code: "N",
      label: "Night",
      category: "WORK",
      counts_as_work_hours: true,
      needs_reason: false,
      needs_approval: false,
    });
  }, 20_000);
});
