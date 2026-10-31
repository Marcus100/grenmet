import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { ApprovalsInbox } from "./approvals-inbox";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BASE = "http://localhost";
const INBOX_URL = `${BASE}/api/v1/hr/workflows/instances/inbox`;
const ACTION_URL = `${BASE}/api/v1/hr/workflows/instances/:id/actions`;

const ITEM = {
  instance_id: "i1",
  workflow_type: "LEAVE_REQUEST",
  entity_type: "leave_request",
  entity_id: "e1",
  department_id: "dept_met",
  requested_by_user_id: "u1",
  requester_name: "Gerad Tamar",
  submitted_at: "2026-07-06T09:40:00Z",
  current_step_order: 1,
  step_is_named: false,
  step_id: "s1",
  is_required: true,
  purpose: "APPROVAL",
  label: "Approval",
};

let inbox = [ITEM];
let actionBodies: unknown[] = [];
const server = setupServer(
  http.get(INBOX_URL, () =>
    HttpResponse.json({ data: inbox, count: inbox.length })
  ),
  http.post(ACTION_URL, async ({ request }) => {
    actionBodies.push(await request.json());
    inbox = [];
    return HttpResponse.json({ id: "i1" });
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  inbox = [ITEM];
  actionBodies = [];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderInbox() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApprovalsInbox />
    </QueryClientProvider>
  );
}

describe("ApprovalsInbox returning a request", () => {
  it("asks for a reason and does not return without one", async () => {
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: "Return" }));
    expect(await screen.findByText("Return this request?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to author" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give a reason");
    expect(actionBodies).toEqual([]);
  });

  it("treats a reason of only spaces as missing", async () => {
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: "Return" }));
    fireEvent.change(await screen.findByLabelText("Reason for returning"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Return to author" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give a reason");
    expect(actionBodies).toEqual([]);
  });

  it("sends the reason with the return action", async () => {
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: "Return" }));
    fireEvent.change(await screen.findByLabelText("Reason for returning"), {
      target: { value: "  Dates clash with the roster  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Return to author" }));
    await waitFor(() => expect(actionBodies).toHaveLength(1));
    expect(actionBodies[0]).toMatchObject({
      action: "RETURN",
      step_id: "s1",
      comments: "Dates clash with the roster",
    });
  });

  it("rejects without asking for a reason", async () => {
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    await waitFor(() => expect(actionBodies).toHaveLength(1));
    expect(actionBodies[0]).toMatchObject({ action: "REJECT" });
  });
});

describe("ApprovalsInbox payroll periods", () => {
  it("sends the approver to the payroll page instead of approving here", async () => {
    inbox = [
      {
        ...ITEM,
        instance_id: "i9",
        workflow_type: "PAYROLL_RUN",
        entity_type: "pay_period",
        entity_id: "period-1",
      },
    ];
    renderInbox();
    const link = await screen.findByRole("link", { name: "Open in payroll" });
    expect(link).toHaveAttribute("href", "/hr/payroll/period-1");
    expect(screen.getByText("Payroll inputs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});
