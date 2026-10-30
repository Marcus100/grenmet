import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { toast } from "sonner";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NotificationSnoozes } from "./notification-snoozes";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const BASE = "http://localhost";
const HOUR_MS = 3_600_000;
const OPEN_DIALOG = /Snooze a notification/u;
const NO_SNOOZES = /No active snoozes/u;
const BOTH_OR_NEITHER = /both the item type and the item id/u;

const setting = (event_key: string, label: string) => ({
  event_key,
  label,
  description: "",
  audience: "",
  variables: [],
  email_mutable: true,
  enabled: true,
  email_enabled: true,
  recipient_roles: [],
  title_template: "",
  body_template: "",
  default_title_template: "",
  default_body_template: "",
  params: {},
  customised: false,
});
const EVENTS = [
  setting("nhc.pull_failed", "NHC request failed"),
  setting("workflow.step_overdue", "Approval reminder"),
];

const snooze = {
  id: "s1",
  event_key: "nhc.pull_failed",
  entity_type: null,
  entity_id: null,
  until: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
  reason: "planned maintenance",
  created_at: new Date().toISOString(),
};

const server = setupServer();

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderSnoozes() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationSnoozes events={EVENTS} organisationId="gaa" />
    </QueryClientProvider>
  );
}

describe("NotificationSnoozes", () => {
  it("says so when nothing is snoozed", async () => {
    server.use(
      http.get(`${BASE}/api/v1/notifications/snoozes`, () =>
        HttpResponse.json([])
      )
    );
    renderSnoozes();
    expect(await screen.findByText(NO_SNOOZES)).toBeInTheDocument();
  });

  it("lists an active snooze with the notification's name and reason", async () => {
    server.use(
      http.get(`${BASE}/api/v1/notifications/snoozes`, () =>
        HttpResponse.json([snooze])
      )
    );
    renderSnoozes();
    expect(await screen.findByText("NHC request failed")).toBeInTheDocument();
    expect(screen.getByText("planned maintenance")).toBeInTheDocument();
    expect(screen.getByText("Whole notification")).toBeInTheDocument();
  });

  it("creates a snooze that ends after the chosen duration", async () => {
    const created: Record<string, unknown>[] = [];
    server.use(
      http.get(`${BASE}/api/v1/notifications/snoozes`, () =>
        HttpResponse.json([])
      ),
      http.post(`${BASE}/api/v1/notifications/snoozes`, async ({ request }) => {
        created.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ ...snooze, id: "s2" }, { status: 201 });
      })
    );
    renderSnoozes();
    fireEvent.click(await screen.findByRole("button", { name: OPEN_DIALOG }));
    fireEvent.change(await screen.findByLabelText("Notification"), {
      target: { value: "workflow.step_overdue" },
    });
    fireEvent.change(screen.getByLabelText("For how long"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "  upgrade window " },
    });
    const before = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    await waitFor(() => expect(created).toHaveLength(1));
    const body = created[0];
    if (!body) {
      throw new Error("No snooze request was sent");
    }
    expect(body.event_key).toBe("workflow.step_overdue");
    expect(body.reason).toBe("upgrade window");
    expect(body.entity_type).toBeNull();
    expect(body.entity_id).toBeNull();
    const until = new Date(body.until as string).getTime();
    expect(until).toBeGreaterThanOrEqual(before + 4 * HOUR_MS - 1000);
    expect(until).toBeLessThanOrEqual(Date.now() + 4 * HOUR_MS + 1000);
  });

  it("does not send a snooze for half an item", async () => {
    let posts = 0;
    server.use(
      http.get(`${BASE}/api/v1/notifications/snoozes`, () =>
        HttpResponse.json([])
      ),
      http.post(`${BASE}/api/v1/notifications/snoozes`, () => {
        posts += 1;
        return HttpResponse.json(snooze, { status: 201 });
      })
    );
    renderSnoozes();
    fireEvent.click(await screen.findByRole("button", { name: OPEN_DIALOG }));
    fireEvent.change(await screen.findByLabelText("Item type"), {
      target: { value: "nhc_job_kind" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringMatching(BOTH_OR_NEITHER)
      )
    );
    expect(posts).toBe(0);
  });

  it("ends a snooze", async () => {
    const removed: string[] = [];
    server.use(
      http.get(`${BASE}/api/v1/notifications/snoozes`, () =>
        HttpResponse.json([snooze])
      ),
      http.delete(`${BASE}/api/v1/notifications/snoozes/:id`, ({ params }) => {
        removed.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      })
    );
    renderSnoozes();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "End snooze for NHC request failed",
      })
    );
    await waitFor(() => expect(removed).toEqual(["s1"]));
  });
});
