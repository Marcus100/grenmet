import { type CapAlertPublic, configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
import { renderWithGmsCatalogue as render } from "@/test/with-gms-catalogue";
import { AlertWorkflow, errorText } from "./alert-workflow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const ID = "11111111-1111-4111-8111-111111111111";
const URL = `http://localhost/api/v1/cap/alerts/${ID}`;
const DRAFT_HINT = /Draft: request review\. Publishing needs an approval/u;
const REVIEW = /I have reviewed this saved alert/u;
/** What the API offers per state (mirrors transitions.py OFFERED_ACTIONS). */
const OFFERED: Record<CapAlertPublic["lifecycle_state"], string[]> = {
  APPROVED: ["publish", "emergency_publish"],
  CANCELLED: [],
  DRAFT: ["submit", "emergency_publish"],
  EXPIRED: [],
  PUBLISHED: ["cancel", "expire"],
  SUBMITTED: ["approve", "emergency_publish"],
};
const initial: CapAlertPublic = {
  id: ID,
  identifier: "GD-warning-1",
  sender: "GMS",
  sent: "2026-09-17T12:00:00Z",
  status: "Test",
  msg_type: "Alert",
  scope: "Public",
  allowed_actions: OFFERED.DRAFT,
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
/** Moves the saved alert to a state and the actions the API offers there. */
function setState(state: CapAlertPublic["lifecycle_state"]) {
  alert = { ...alert, allowed_actions: OFFERED[state], lifecycle_state: state };
}
let actions: string[];
let emergencyBody: unknown;
let permissionKeys: string[];
const server = setupServer(
  http.get(URL, () => HttpResponse.json(alert)),
  http.post(`${URL}/validate`, () =>
    HttpResponse.json({
      is_valid: true,
      errors: [],
      warnings: ["Check affected areas."],
    })
  ),
  http.get("http://localhost/api/v1/auth/access/me", () =>
    HttpResponse.json({
      is_superuser: false,
      role_names: [],
      permission_keys: permissionKeys,
    })
  ),
  http.post(`${URL}/emergency-publish`, async ({ request }) => {
    emergencyBody = await request.json();
    actions.push("emergency-publish");
    setState("PUBLISHED");
    return HttpResponse.json({ alert, snapshot: {} });
  }),
  http.post(`${URL}/:action`, ({ params }) => {
    const action = String(params.action);
    actions.push(action);
    const states = {
      submit: "SUBMITTED",
      approve: "APPROVED",
      publish: "PUBLISHED",
      cancel: "CANCELLED",
      expire: "EXPIRED",
    } as const;
    if (!(action in states)) return new HttpResponse(null, { status: 404 });
    setState(states[action as keyof typeof states]);
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
  emergencyBody = undefined;
  permissionKeys = [];
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
    await screen.findByRole("button", { name: "Request review" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Publish CAP alert" })
  ).toBeDisabled();
  await review();
  expect(
    screen.getByText("Warning: Check affected areas.")
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Workflow note"), {
    target: { value: "Reviewed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request review" }));
  expect(
    await screen.findByRole("button", { name: "Record approval" })
  ).toBeDisabled();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Record approval" }));
  expect(
    await screen.findByRole("button", { name: "Publish CAP alert" })
  ).toBeDisabled();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Publish CAP alert" }));
  await screen.findByText("CAP state: PUBLISHED.");
  expect(actions).toEqual(["submit", "approve", "publish"]);
  expect(
    screen.queryByRole("button", { name: "Publish CAP alert" })
  ).not.toBeInTheDocument();
});

it("keeps Publish disabled until the alert is approved", async () => {
  show();
  await review();
  expect(
    screen.getByRole("button", { name: "Publish CAP alert" })
  ).toBeDisabled();
  expect(screen.getByText(DRAFT_HINT)).toBeInTheDocument();
  expect(actions).toEqual([]);
});

it("hides Emergency publish from users without the emergency permission", async () => {
  show();
  await review();
  expect(
    screen.queryByRole("button", { name: "Emergency publish" })
  ).not.toBeInTheDocument();
});

it("lets a duty supervisor emergency-publish a draft with a reason", async () => {
  permissionKeys = ["cap.alert.publish_emergency"];
  show();
  const emergency = await screen.findByRole("button", {
    name: "Emergency publish",
  });
  await review();
  expect(emergency).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Workflow note"), {
    target: { value: "Approver unreachable during tsunami watch" },
  });
  fireEvent.click(emergency);
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirm emergency publish" })
  );
  await screen.findByText("CAP state: PUBLISHED.");
  expect(actions).toEqual(["emergency-publish"]);
  expect(emergencyBody).toEqual({
    reason: "Approver unreachable during tsunami watch",
  });
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
  expect(screen.getByRole("button", { name: "Request review" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Publish CAP alert" })
  ).toBeDisabled();
  expect(actions).toEqual([]);
});

it("shows a backend approval refusal without advancing state", async () => {
  setState("SUBMITTED");
  server.use(
    http.post(`${URL}/approve`, () =>
      HttpResponse.json(
        { detail: "Insufficient permission for this operation" },
        { status: 403 }
      )
    )
  );
  show();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Record approval" }));
  await screen.findByText("Insufficient permission for this operation");
  expect(
    screen.getByRole("button", { name: "Record approval" })
  ).toBeInTheDocument();
});

it("shows the messages of a documented validation 422, not its fixed detail", async () => {
  setState("SUBMITTED");
  server.use(
    http.post(`${URL}/approve`, () =>
      HttpResponse.json(
        {
          detail: "Validation error",
          errors: [
            {
              loc: ["body", "note"],
              msg: "Value error, A review note is required",
              type: "value_error",
            },
          ],
        },
        { status: 422 }
      )
    )
  );
  show();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Record approval" }));
  await screen.findByText("Value error, A review note is required");
  expect(screen.queryByText("Validation error")).not.toBeInTheDocument();
});

it("hides review actions from users without the approve permission", async () => {
  setState("SUBMITTED");
  show();
  await screen.findByRole("button", { name: "Record approval" });
  expect(
    screen.queryByRole("button", { name: "Mark reviewed" })
  ).not.toBeInTheDocument();
});

it("records an optional colleague review without changing the state", async () => {
  setState("SUBMITTED");
  permissionKeys = ["cap.alert.approve"];
  let body: unknown;
  server.use(
    http.post(`${URL}/reviews`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(alert);
    })
  );
  show();
  await screen.findByRole("button", { name: "Mark reviewed" });
  expect(
    screen.getByRole("button", { name: "Request changes" })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
  await screen.findByText("Review recorded in the audit history.");
  expect(body).toEqual({ outcome: "reviewed", note: null });
});

it("cancels a published alert after confirming, and issuing a Cancel message", async () => {
  setState("PUBLISHED");
  show();
  const cancel = await screen.findByRole("button", { name: "Cancel alert" });
  expect(cancel).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Cancellation reason"), {
    target: { value: "Hazard has ended" },
  });
  fireEvent.click(cancel);
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirm cancellation" })
  );
  await screen.findByText("CAP state: CANCELLED.");
  expect(actions).toEqual(["cancel"]);
});

it("asks before marking a published alert expired, and does nothing until confirmed", async () => {
  setState("PUBLISHED");
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Mark expired" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Keep it published" })
  );
  expect(actions).toEqual([]);
  fireEvent.click(await screen.findByRole("button", { name: "Mark expired" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirm: mark expired" })
  );
  await screen.findByText("CAP state: EXPIRED.");
  expect(actions).toEqual(["expire"]);
});

it("reloads state after a conflict without automatically repeating publication", async () => {
  setState("APPROVED");
  let attempts = 0;
  server.use(
    http.post(`${URL}/publish`, () => {
      attempts++;
      setState("PUBLISHED");
      return HttpResponse.json(
        {
          detail: "Only a draft, submitted or approved alert can be published.",
        },
        { status: 409 }
      );
    })
  );
  show();
  await review();
  fireEvent.click(screen.getByRole("button", { name: "Publish CAP alert" }));
  await screen.findByText(
    "Only a draft, submitted or approved alert can be published."
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Publish CAP alert" })
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
    screen.queryByRole("button", { name: "Request review" })
  ).not.toBeInTheDocument();
});

it("keeps Publish disabled when the API does not list publish, even when approved", async () => {
  setState("APPROVED");
  alert = { ...alert, allowed_actions: ["emergency_publish"] };
  show();
  await review();
  expect(
    screen.getByRole("button", { name: "Publish CAP alert" })
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Record approval" })
  ).not.toBeInTheDocument();
});

it("hides Cancel when the API does not list cancel, and keeps Mark expired", async () => {
  setState("PUBLISHED");
  alert = { ...alert, allowed_actions: ["expire"] };
  show();
  await screen.findByRole("button", { name: "Mark expired" });
  expect(
    screen.queryByRole("button", { name: "Cancel alert" })
  ).not.toBeInTheDocument();
});

describe("errorText", () => {
  const fallback = "Could not save.";

  it("never shows a raw HTTP status line", () => {
    expect(
      errorText(
        new Error(
          "POST /api/v1/cap/alerts failed with status 422 Unprocessable Content"
        ),
        fallback
      )
    ).toBe(fallback);
  });

  it("joins a FastAPI validation list instead of printing JSON", () => {
    const error = {
      data: {
        detail: [
          { loc: ["body", "info"], msg: "Expires must be after effective" },
          { loc: ["body", "area"], msg: "Add an area description" },
        ],
      },
    };
    expect(errorText(error, fallback)).toBe(
      "Expires must be after effective; Add an area description"
    );
  });

  it("keeps the API's own sentence", () => {
    expect(errorText({ data: { detail: "Permission denied" } }, fallback)).toBe(
      "Permission denied"
    );
  });
});
