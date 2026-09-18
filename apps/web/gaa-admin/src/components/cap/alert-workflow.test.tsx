import { type CapAlertPublic, configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { AlertWorkflow } from "./alert-workflow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const ID = "11111111-1111-4111-8111-111111111111";
const URL = `http://localhost/api/v1/cap/alerts/${ID}`;
const REVIEW = /I have reviewed this saved bulletin/;
const initial: CapAlertPublic = {
  id: ID,
  identifier: "GD-warning-1",
  sender: "GMS",
  sent: "2026-09-17T12:00:00Z",
  status: "Test",
  msg_type: "Alert",
  scope: "Public",
  lifecycle_state: "DRAFT",
  created_by_user_id: ID,
  created_at: "2026-09-17T12:00:00Z",
  updated_at: "2026-09-17T12:00:00Z",
  info: [
    {
      id: ID,
      sequence: 0,
      language: "en",
      event: "Rain",
      headline: "Heavy rain warning",
      description: "Rain expected.",
      instruction: "Avoid flooded roads.",
      areas: [],
    },
  ],
};
let alert: CapAlertPublic;
let actions: string[];
const server = setupServer(
  http.get(URL, () => HttpResponse.json(alert)),
  http.post(`${URL}/validate`, () =>
    HttpResponse.json({
      is_valid: true,
      errors: [],
      warnings: ["Check affected areas."],
    })
  ),
  http.post(`${URL}/:action`, ({ params }) => {
    const action = String(params.action);
    actions.push(action);
    const states = {
      submit: "SUBMITTED",
      approve: "APPROVED",
      publish: "PUBLISHED",
    } as const;
    if (!(action in states)) return new HttpResponse(null, { status: 404 });
    alert = {
      ...alert,
      lifecycle_state: states[action as keyof typeof states],
    };
    return HttpResponse.json(
      action === "publish" ? { alert, snapshot: {} } : alert
    );
  })
);
beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  alert = structuredClone(initial);
  actions = [];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AlertWorkflow alertId={ID} />
    </QueryClientProvider>
  );
}
async function review() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Validate alert" })
  );
  await screen.findByText("Validation passed.");
  fireEvent.click(screen.getByLabelText(REVIEW));
}

it("validates and reviews each step through publication using the backend responses", async () => {
  show();
  expect(
    await screen.findByRole("button", { name: "Submit for approval" })
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Publish CAP bulletin" })
  ).not.toBeInTheDocument();
  await review();
  expect(
    screen.getByText("Warning: Check affected areas.")
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Workflow note"), {
    target: { value: "Reviewed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
  expect(
    await screen.findByRole("button", { name: "Approve alert" })
  ).toBeDisabled();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Approve alert" }));
  expect(
    await screen.findByRole("button", { name: "Publish CAP bulletin" })
  ).toBeDisabled();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Publish CAP bulletin" }));
  await screen.findByText("CAP state: PUBLISHED.");
  expect(actions).toEqual(["submit", "approve", "publish"]);
  expect(
    screen.queryByRole("button", { name: "Publish CAP bulletin" })
  ).not.toBeInTheDocument();
});

it("shows validation errors and prevents submission", async () => {
  server.use(
    http.post(`${URL}/validate`, () =>
      HttpResponse.json({
        is_valid: false,
        errors: ["Expiry is required."],
        warnings: [],
      })
    )
  );
  show();
  fireEvent.click(
    await screen.findByRole("button", { name: "Validate alert" })
  );
  await screen.findByText("Error: Expiry is required.");
  expect(
    screen.getByRole("button", { name: "Submit for approval" })
  ).toBeDisabled();
  expect(actions).toEqual([]);
});

it("shows backend self-approval denial without advancing state", async () => {
  alert.lifecycle_state = "SUBMITTED";
  server.use(
    http.post(`${URL}/approve`, () =>
      HttpResponse.json(
        { detail: "Another authorised person must approve this alert" },
        { status: 403 }
      )
    )
  );
  show();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Approve alert" }));
  await screen.findByText("Another authorised person must approve this alert");
  expect(
    screen.queryByRole("button", { name: "Publish CAP bulletin" })
  ).not.toBeInTheDocument();
});

it("reloads state after a conflict without automatically repeating publication", async () => {
  alert.lifecycle_state = "APPROVED";
  let attempts = 0;
  server.use(
    http.post(`${URL}/publish`, () => {
      attempts++;
      alert.lifecycle_state = "PUBLISHED";
      return HttpResponse.json(
        { detail: "Only approved CAP alerts can be published." },
        { status: 409 }
      );
    })
  );
  show();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Publish CAP bulletin" }));
  await screen.findByText("Only approved CAP alerts can be published.");
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Publish CAP bulletin" })
    ).not.toBeInTheDocument()
  );
  expect(attempts).toBe(1);
});

it("does not expose actions when loading the alert fails", async () => {
  server.use(
    http.get(URL, () =>
      HttpResponse.json({ detail: "Permission denied" }, { status: 403 })
    )
  );
  show();
  await screen.findByText("Permission denied");
  expect(
    screen.queryByRole("button", { name: "Submit for approval" })
  ).not.toBeInTheDocument();
});
