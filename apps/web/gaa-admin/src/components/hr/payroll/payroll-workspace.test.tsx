import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PayrollWorkspace } from "./payroll-workspace";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => "/hr/payroll",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

const BASE = "http://localhost";
const PATTERN_0 = /No pay calendar yet/;
const PATTERN_1 = /Quantities only/;
const API = `${BASE}/api/v1/hr/payroll`;

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/organisations`, () =>
    HttpResponse.json([{ id: "new_org", code: "NEW", name: "Synthetic Org" }])
  ),
  http.get(`${API}/calendars`, () => HttpResponse.json({ data: [] })),
  http.get(`${API}/periods`, () => HttpResponse.json({ data: [], count: 0 })),
  http.get(`${API}/items`, () =>
    HttpResponse.json({ data: [], overtime_bands_available: false })
  ),
  http.get(`${API}/department-settings`, () =>
    HttpResponse.json({
      data: [
        {
          department_id: "acc",
          department_name: "Accounts",
          shift_worker_default: false,
        },
      ],
    })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  search = "";
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PayrollWorkspace />
    </QueryClientProvider>
  );
}

describe("PayrollWorkspace", () => {
  it("shows an empty period list and the calendar set-up for a new organisation", async () => {
    renderWorkspace();
    expect(await screen.findByText(PATTERN_0)).toBeVisible();
    expect(await screen.findByText("No pay periods yet.")).toBeVisible();
    expect(
      screen.getByRole("option", { name: "Accounts" })
    ).toBeInTheDocument();
    expect(screen.getByText(PATTERN_1)).toBeVisible();
  });

  it("keeps an empty pay item catalogue visible", async () => {
    search = "tab=items";
    renderWorkspace();
    expect(
      await screen.findByText("No pay items for this organisation yet.")
    ).toBeVisible();
  });

  it("explains a missing payroll permission", async () => {
    search = "tab=items";
    server.use(
      http.get(`${API}/items`, () =>
        HttpResponse.json({ detail: "Pay period not found" }, { status: 404 })
      )
    );
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have payroll access"
    );
  });
});
