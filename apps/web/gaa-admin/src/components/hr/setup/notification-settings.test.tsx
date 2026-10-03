import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NotificationSettings } from "./notification-settings";

const EDIT_REMINDER = /Edit Approval reminder/;
const DOMAIN_LIMIT = /limited to barrels.gd/;

const BASE = "http://localhost";

const overdue = {
  event_key: "workflow.step_overdue",
  label: "Approval reminder",
  description: "A request has waited too long for your approval.",
  audience: "The approvers of the waiting step",
  variables: ["request_type", "days_waiting"],
  email_mutable: false,
  enabled: true,
  email_enabled: true,
  recipient_roles: [],
  title_template: "Reminder: {{ request_type }}",
  body_template: "{{ summary }}",
  default_title_template: "Reminder: {{ request_type }}",
  default_body_template: "{{ summary }}",
  params: {
    remind_after_days: 2,
    escalate_after_days: null,
    expiry_days_before: null,
  },
  customised: false,
};

const SETTINGS = {
  organisation_id: "gaa",
  allowed_domains: ["barrels.gd"],
  events: [overdue],
  unreachable: [{ user_id: "u9", name: "Pat Moore", email: "pat@gmail.com" }],
};

const server = setupServer(
  http.get(`${BASE}/api/v1/notifications/settings`, () =>
    HttpResponse.json(SETTINGS)
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationSettings />
    </QueryClientProvider>
  );
}

describe("NotificationSettings", () => {
  it("lists events and staff who cannot receive email", async () => {
    renderSettings();
    expect(await screen.findByText(overdue.description)).toBeInTheDocument();
    expect(screen.getByText(DOMAIN_LIMIT)).toBeInTheDocument();
    expect(screen.getByText("pat@gmail.com")).toBeInTheDocument();
  }, 20_000);

  it("saves a changed reminder timing", async () => {
    const saved: Record<string, unknown>[] = [];
    server.use(
      http.put(
        `${BASE}/api/v1/notifications/settings/:key`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          saved.push(body);
          return HttpResponse.json({ ...overdue, ...body, customised: true });
        }
      )
    );
    renderSettings();

    await screen.findByText(overdue.description);
    fireEvent.click(screen.getByRole("button", { name: EDIT_REMINDER }));
    fireEvent.change(
      await screen.findByLabelText("Remind the approver after (days)"),
      { target: { value: "3" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({
      enabled: true,
      params: { remind_after_days: 3 },
    });
  }, 20_000);
});
