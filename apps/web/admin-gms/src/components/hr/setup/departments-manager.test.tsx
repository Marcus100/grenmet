import { configureApiClient } from "@grenmet/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DepartmentsManager } from "./departments-manager";

const BASE = "http://localhost";
const NEW_DEPT_LABEL = /New department/;
const CREATE_LABEL = /^Create$/;

const DEPARTMENTS = {
  data: [{ id: "dept_met", name: "Meteorological Department" }],
  count: 1,
};

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/departments`, () =>
    HttpResponse.json(DEPARTMENTS)
  )
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
      <DepartmentsManager />
    </QueryClientProvider>
  );
}

describe("DepartmentsManager", () => {
  it("lists departments with their short id", async () => {
    renderManager();
    expect(
      await screen.findByText("Meteorological Department")
    ).toBeInTheDocument();
    expect(screen.getByText("dept_met")).toBeInTheDocument();
  }, 20_000);

  it("creates a department, auto-deriving the short id from the name", async () => {
    const posted: Record<string, unknown>[] = [];
    server.use(
      http.get(`${BASE}/api/v1/hr/departments`, () =>
        HttpResponse.json({ data: [], count: 0 })
      ),
      http.post(`${BASE}/api/v1/hr/departments`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posted.push(body);
        return HttpResponse.json(body, { status: 201 });
      })
    );

    renderManager();

    fireEvent.click(
      await screen.findByRole("button", { name: NEW_DEPT_LABEL })
    );
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Ops Team" },
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE_LABEL }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ id: "ops_team", name: "Ops Team" });
  }, 20_000);
});
