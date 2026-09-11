import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { CatalogueSetup } from "./catalogue-setup";

const BASE = "http://localhost";
const server = setupServer(
  http.get(`${BASE}/api/v1/hr/departments`, () =>
    HttpResponse.json({
      data: [
        { id: "meteorological_department", name: "Meteorological Department" },
      ],
      count: 1,
    })
  )
);
const missing = {
  department_id: "meteorological_department",
  missing_grade_ids: ["GMS_MANAGER"],
  missing_policy_keys: ["cap"],
  missing_workflow_types: [],
  conflicts: [],
};
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("previews before import and refreshes staff only after success", async () => {
  const requests: unknown[] = [];
  server.use(
    http.get(`${BASE}/api/v1/hr/setup/catalogue`, ({ request }) => {
      expect(new URL(request.url).searchParams.get("department_id")).toBe(
        "meteorological_department"
      );
      return HttpResponse.json(missing);
    }),
    http.post(`${BASE}/api/v1/hr/setup/catalogue`, async ({ request }) => {
      requests.push(await request.json());
      return HttpResponse.json({
        ...missing,
        missing_grade_ids: [],
        missing_policy_keys: [],
      });
    })
  );
  const onSaved = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CatalogueSetup onSaved={onSaved} />
    </QueryClientProvider>
  );
  await screen.findByRole("option", { name: "Meteorological Department" });
  expect(
    screen.queryByRole("button", { name: "Import missing setup" })
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("Department"), {
    target: { value: "meteorological_department" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Preview missing setup" })
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Import missing setup" })
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(requests).toEqual([{ department_id: "meteorological_department" }]);
});

it("blocks import on conflicts and clears preview when department changes", async () => {
  server.use(
    http.get(`${BASE}/api/v1/hr/setup/catalogue`, () =>
      HttpResponse.json({
        ...missing,
        conflicts: ["Existing grade belongs to another department"],
      })
    )
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CatalogueSetup onSaved={vi.fn()} />
    </QueryClientProvider>
  );
  await screen.findByRole("option", { name: "Meteorological Department" });
  fireEvent.change(screen.getByLabelText("Department"), {
    target: { value: "meteorological_department" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Preview missing setup" })
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Existing grade belongs"
  );
  expect(
    screen.getByRole("button", { name: "Import missing setup" })
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Department"), {
    target: { value: "" },
  });
  expect(
    screen.queryByRole("button", { name: "Import missing setup" })
  ).toBeNull();
});
