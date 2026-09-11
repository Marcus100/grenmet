import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { TrainingRecords } from "@/components/hr/training/training-records";
import { TrainingWorkspace } from "@/components/hr/training/training-workspace";

const BASE = "http://localhost";
const USER = "00000000-0000-0000-0000-000000000001";
const record = {
  id: "00000000-0000-0000-0000-000000000002",
  user_id: USER,
  organisation_id: "gaa",
  department_id: "met",
  course_name: "Observer refresher",
  provider: "Training centre",
  result: "completed",
  completed_on: "2025-01-01",
  expires_on: "2027-01-01",
  can_manage: true,
};
const server = setupServer(
  http.get(`${BASE}/api/v1/hr/training-records`, () =>
    HttpResponse.json({ data: [record], count: 1, can_create: true })
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function show(workspace = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {workspace ? (
        <TrainingWorkspace />
      ) : (
        <TrainingRecords organisationId="gaa" userId={USER} />
      )}
    </QueryClientProvider>
  );
}

it("shows training history and respects read-only employee capabilities", async () => {
  server.use(
    http.get(`${BASE}/api/v1/hr/training-records`, () =>
      HttpResponse.json({
        data: [{ ...record, can_manage: false }],
        count: 1,
        can_create: false,
      })
    )
  );
  show();
  expect(
    await screen.findByRole("heading", { name: record.course_name })
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Add training record" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: `Archive ${record.course_name}` })
  ).not.toBeInTheDocument();
});

it("saves the selected employee and organisation, then refreshes history", async () => {
  let saved: unknown;
  server.use(
    http.post(`${BASE}/api/v1/hr/training-records`, async ({ request }) => {
      saved = await request.json();
      return HttpResponse.json(record, { status: 201 });
    })
  );
  show();
  fireEvent.click(
    await screen.findByRole("button", { name: "Add training record" })
  );
  fireEvent.change(screen.getByLabelText("Course name"), {
    target: { value: "New course" },
  });
  fireEvent.change(screen.getByLabelText("Training provider"), {
    target: { value: "Provider" },
  });
  fireEvent.change(screen.getByLabelText("Training end date"), {
    target: { value: "2025-01-01" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Add training record" }));
  await waitFor(() =>
    expect(saved).toMatchObject({
      user_id: USER,
      organisation_id: "gaa",
      course_name: "New course",
      provider: "Provider",
      result: "completed",
      completed_on: "2025-01-01",
      expires_on: null,
    })
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("form", { name: "Add training record" })
    ).not.toBeInTheDocument()
  );
});

it("rejects expiry on an attendance-only record before submission", async () => {
  show();
  fireEvent.click(
    await screen.findByRole("button", { name: "Add training record" })
  );
  fireEvent.change(screen.getByLabelText("Training end date"), {
    target: { value: "2025-01-01" },
  });
  fireEvent.change(screen.getByLabelText("Result"), {
    target: { value: "attended" },
  });
  fireEvent.change(screen.getByLabelText("Certificate expiry (optional)"), {
    target: { value: "2027-01-01" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Add training record" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Expiry requires successful completion"
  );
});

it("requires an archive reason and sends it only after confirmation", async () => {
  let saved: unknown;
  server.use(
    http.post(
      `${BASE}/api/v1/hr/training-records/${record.id}/archive`,
      async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json(record);
      }
    )
  );
  show();
  fireEvent.click(
    await screen.findByRole("button", { name: `Archive ${record.course_name}` })
  );
  expect(saved).toBeUndefined();
  fireEvent.change(screen.getByLabelText("Archive reason"), {
    target: { value: "Wrong completion date" },
  });
  fireEvent.submit(
    screen.getByRole("form", { name: "Archive training record" })
  );
  await waitFor(() =>
    expect(saved).toEqual({ reason: "Wrong completion date" })
  );
});

it("clears employee selection when switching organisations", async () => {
  server.use(
    http.get(`${BASE}/api/v1/hr/organisations`, () =>
      HttpResponse.json([
        { id: "gaa", name: "GAA" },
        { id: "other", name: "Other" },
      ])
    ),
    http.get(`${BASE}/api/v1/hr/training-employees`, ({ request }) =>
      HttpResponse.json({
        data: [
          {
            user_id: USER,
            name: new URL(request.url).searchParams.get("organisation_id"),
            department_id: "met",
          },
        ],
        count: 1,
      })
    )
  );
  show(true);
  const selector = await screen.findByLabelText("Organisation");
  fireEvent.change(selector, { target: { value: "gaa" } });
  fireEvent.click(await screen.findByRole("button", { name: "gaa · met" }));
  await screen.findByRole("region", { name: "Employee training history" });
  fireEvent.change(selector, { target: { value: "other" } });
  await screen.findByRole("button", { name: "other · met" });
  expect(
    screen.queryByRole("region", { name: "Employee training history" })
  ).not.toBeInTheDocument();
});
