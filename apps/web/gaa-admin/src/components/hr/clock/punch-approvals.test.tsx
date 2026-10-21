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
import { PunchApprovals } from "./punch-approvals";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const BASE = "http://localhost";
const LIST_URL = `${BASE}/api/v1/hr/attendance/clock-punches/pending`;
const APPROVE_URL = `${LIST_URL.replace("/pending", "")}/:id/approve`;
const REJECT_URL = `${LIST_URL.replace("/pending", "")}/:id/reject`;

const PUNCH = {
  id: "p1",
  user_id: "u1",
  department_id: "dept_met",
  roster_assignment_id: "a1",
  kind: "ARRIVE",
  punched_at: "2026-07-06T09:40:00Z",
  status: "PENDING",
  employee_name: "Gerad Tamar",
  site_name: "Main gate",
  shift_date: "2026-07-06",
  shift_code: "M",
};

let pending = [PUNCH];
let rejectBody: unknown;
const server = setupServer(
  http.get(LIST_URL, () =>
    HttpResponse.json({ data: pending, count: pending.length })
  ),
  http.post(APPROVE_URL, () => {
    pending = [];
    return HttpResponse.json({ ...PUNCH, status: "APPROVED" });
  }),
  http.post(REJECT_URL, async ({ request }) => {
    rejectBody = await request.json();
    pending = [];
    return HttpResponse.json({ ...PUNCH, status: "REJECTED" });
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  pending = [PUNCH];
  rejectBody = undefined;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderQueue() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PunchApprovals />
    </QueryClientProvider>
  );
}

describe("PunchApprovals", () => {
  it("lists pending punches with employee, site, kind and shift", async () => {
    renderQueue();
    const list = await screen.findByRole("list", {
      name: "Pending phone punches",
    });
    expect(list).toHaveTextContent("Gerad Tamar");
    expect(list).toHaveTextContent("Arrival");
    expect(list).toHaveTextContent("Main gate");
    expect(list).toHaveTextContent("Shift M");
  });

  it("approves a punch and shows the empty state", async () => {
    renderQueue();
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve Gerad Tamar arrival" })
    );
    expect(await screen.findByText("No phone punches waiting")).toBeVisible();
  });

  it("explains the empty state instead of hiding the section", async () => {
    pending = [];
    renderQueue();
    expect(await screen.findByText("No phone punches waiting")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Phone punches" })
    ).toBeVisible();
  });

  it("requires a reason before rejecting", async () => {
    renderQueue();
    fireEvent.click(
      await screen.findByRole("button", { name: "Reject Gerad Tamar arrival" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Reject punch" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Give a reason");
    expect(rejectBody).toBeUndefined();
  });

  it("sends the reason when rejecting", async () => {
    renderQueue();
    fireEvent.click(
      await screen.findByRole("button", { name: "Reject Gerad Tamar arrival" })
    );
    fireEvent.change(await screen.findByLabelText("Reason"), {
      target: { value: "Not on site" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject punch" }));
    await waitFor(() => expect(rejectBody).toEqual({ reason: "Not on site" }));
    expect(await screen.findByText("No phone punches waiting")).toBeVisible();
  });

  it("surfaces a 409 reason from the API", async () => {
    const { toast } = await import("sonner");
    server.use(
      http.post(APPROVE_URL, () =>
        HttpResponse.json(
          { detail: "Approve the matching arrival before this departure" },
          { status: 409 }
        )
      )
    );
    renderQueue();
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve Gerad Tamar arrival" })
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Approve the matching arrival")
      )
    );
  });

  it("says when the caller lacks permission", async () => {
    server.use(
      http.get(LIST_URL, () => new HttpResponse(null, { status: 403 }))
    );
    renderQueue();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "cannot review phone punches"
    );
  });
});
