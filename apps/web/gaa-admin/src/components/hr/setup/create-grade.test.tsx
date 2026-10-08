import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { CreateGrade } from "./create-grade";

const BASE = "http://localhost";
const seen: string[] = [];
const saved: unknown[] = [];
const server = setupServer(
  http.get(`${BASE}/api/v1/hr/departments`, ({ request }) => {
    seen.push(new URL(request.url).searchParams.get("organisation_id") ?? "");
    return HttpResponse.json({
      data: [
        { id: "example_ops", name: "Operations", organisation_id: "example" },
      ],
      count: 1,
    });
  }),
  http.put(`${BASE}/api/v1/hr/setup/grades/:id`, async ({ request }) => {
    const body: unknown = await request.json();
    saved.push(body);
    return HttpResponse.json({ message: "Saved" });
  })
);
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  seen.length = 0;
  saved.length = 0;
});
afterAll(() => server.close());
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CreateGrade onSaved={() => undefined} organisationId="example" />
    </QueryClientProvider>
  );
}
it("creates an employer's own grade without importing GMS configuration", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Add grade" }));
  await screen.findByRole("option", { name: "Operations" });
  expect(seen).toEqual(["example"]);
  fireEvent.change(screen.getByLabelText("Department"), {
    target: { value: "example_ops" },
  });
  fireEvent.change(screen.getByLabelText("Grade code"), {
    target: { value: "assistant" },
  });
  fireEvent.change(screen.getByLabelText("Grade name"), {
    target: { value: "Operations Assistant" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save new grade" }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({
    department_id: "example_ops",
    code: "ASSISTANT",
    label: "Operations Assistant",
    rank: 1,
    is_active: true,
  });
});
it("blocks grade creation until an employer has a department", async () => {
  server.use(
    http.get(`${BASE}/api/v1/hr/departments`, () =>
      HttpResponse.json({ data: [], count: 0 })
    )
  );
  show();
  fireEvent.click(screen.getByRole("button", { name: "Add grade" }));
  await screen.findByText("Create a department before adding grades.");
  expect(screen.getByRole("button", { name: "Save new grade" })).toBeDisabled();
});

it("keeps failed grade creation open with the API reason for correction", async () => {
  server.use(
    http.put(`${BASE}/api/v1/hr/setup/grades/:id`, () =>
      HttpResponse.json(
        { detail: "Grade code already exists" },
        { status: 409 }
      )
    )
  );
  show();
  fireEvent.click(screen.getByRole("button", { name: "Add grade" }));
  await screen.findByRole("option", { name: "Operations" });
  fireEvent.change(screen.getByLabelText("Department"), {
    target: { value: "example_ops" },
  });
  fireEvent.change(screen.getByLabelText("Grade code"), {
    target: { value: "staff" },
  });
  fireEvent.change(screen.getByLabelText("Grade name"), {
    target: { value: "Staff" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save new grade" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Grade code already exists"
  );
  expect(screen.getByRole("button", { name: "Save new grade" })).toBeEnabled();
  expect(screen.getByLabelText("Grade name")).toHaveValue("Staff");
});
