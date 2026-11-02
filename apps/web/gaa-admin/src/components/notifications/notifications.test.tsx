import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NotificationBell } from "./notification-bell";
import { NotificationPreferences } from "./notification-preferences";

const APPROVAL_EMAIL = "Approval waiting for you, email";
const REQUEST_APPROVED_EMAIL = "Your request was approved, email";
const REQUEST_APPROVED_BELL = "Your request was approved, bell";
const FORECAST_BELL = "Forecast overdue, bell";
const GROUPED_COUNT = "×3";
const URGENT_LABEL = /^Urgent: Forecast is overdue/u;
const REPEATED_WORDS = /repeated 3 times/u;

const BASE = "http://localhost";
const BELL_UNREAD = /Notifications, 2 unread/u;

const unreadItem = {
  id: "n1",
  event_key: "workflow.step_awaiting",
  title: "Leave request waiting for your approval",
  body: "Jane Charles — Vacation, 12 Oct 2026 to 16 Oct 2026",
  link_path: null,
  entity_type: "leave_request",
  entity_id: "l1",
  repeat_count: 1,
  urgent: false,
  read_at: null,
  created_at: new Date().toISOString(),
};

const server = setupServer(
  http.get(`${BASE}/api/v1/notifications/unread-count`, () =>
    HttpResponse.json({ count: 2 })
  ),
  http.get(`${BASE}/api/v1/notifications`, () =>
    HttpResponse.json({
      data: [unreadItem],
      count: 1,
      page: 1,
      size: 8,
      total_pages: 1,
    })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );
}

describe("NotificationBell", () => {
  it("shows the unread count and marks an item read when opened", async () => {
    const marked: string[] = [];
    server.use(
      http.post(`${BASE}/api/v1/notifications/:id/read`, ({ params }) => {
        marked.push(String(params.id));
        return HttpResponse.json({
          ...unreadItem,
          read_at: new Date().toISOString(),
        });
      })
    );
    wrap(<NotificationBell />);

    const bell = await screen.findByRole("button", { name: BELL_UNREAD });
    expect(bell).toHaveTextContent("2");
    fireEvent.click(bell);
    fireEvent.click(await screen.findByText(unreadItem.title));

    await waitFor(() => expect(marked).toEqual(["n1"]));
  });
});

describe("NotificationBell grouping", () => {
  it("shows how many repeats a grouped notification stands for", async () => {
    server.use(
      http.get(`${BASE}/api/v1/notifications`, () =>
        HttpResponse.json({
          data: [{ ...unreadItem, repeat_count: 3 }],
          count: 1,
          page: 1,
          size: 8,
          total_pages: 1,
        })
      )
    );
    wrap(<NotificationBell />);

    fireEvent.click(await screen.findByRole("button", { name: BELL_UNREAD }));

    const badge = await screen.findByText(GROUPED_COUNT);
    expect(badge).toBeInTheDocument();
    // Screen readers skip the symbol and hear the plain-words version.
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(REPEATED_WORDS)).toHaveClass("sr-only");
  });
});

describe("NotificationBell urgency", () => {
  it("marks an urgent notification with the word Urgent, not only colour", async () => {
    server.use(
      http.get(`${BASE}/api/v1/notifications`, () =>
        HttpResponse.json({
          data: [
            { ...unreadItem, id: "n2", title: "Calm one" },
            { ...unreadItem, urgent: true, title: "Forecast is overdue" },
          ],
          count: 2,
          page: 1,
          size: 8,
          total_pages: 1,
        })
      )
    );
    wrap(<NotificationBell />);

    fireEvent.click(await screen.findByRole("button", { name: BELL_UNREAD }));

    await screen.findByText("Forecast is overdue", { exact: false });
    expect(screen.getAllByText("Urgent")).toHaveLength(1);
    // The link name reads "Urgent: Forecast is overdue", not "UrgentForecast...".
    expect(screen.getByText("Urgent").parentElement?.textContent).toMatch(
      URGENT_LABEL
    );
  });
});

describe("NotificationPreferences", () => {
  it("saves an email opt-out and locks approval requests on", async () => {
    const saved: unknown[] = [];
    const prefs = [
      {
        event_key: "workflow.step_awaiting",
        label: "Approval waiting for you",
        description: "A request has reached a step you can approve.",
        email_mutable: false,
        email_enabled: true,
        bell_mutable: true,
        bell_enabled: true,
        urgent: false,
      },
      {
        event_key: "workflow.approved",
        label: "Your request was approved",
        description: "Your request completed its approval chain.",
        email_mutable: true,
        email_enabled: true,
        bell_mutable: true,
        bell_enabled: true,
        urgent: false,
      },
      {
        event_key: "gms.forecast_overdue",
        label: "Forecast overdue",
        description: "A scheduled forecast has not been issued.",
        email_mutable: true,
        email_enabled: true,
        bell_mutable: false,
        bell_enabled: true,
        urgent: true,
      },
    ];
    server.use(
      http.get(`${BASE}/api/v1/notifications/preferences`, () =>
        HttpResponse.json(prefs)
      ),
      http.put(
        `${BASE}/api/v1/notifications/preferences`,
        async ({ request }) => {
          saved.push(await request.json());
          return HttpResponse.json([
            prefs[0],
            { ...prefs[1], email_enabled: false },
            prefs[2],
          ]);
        }
      )
    );
    wrap(<NotificationPreferences />);

    const locked = await screen.findByRole("switch", {
      name: APPROVAL_EMAIL,
    });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("switch", { name: FORECAST_BELL })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("switch", { name: REQUEST_APPROVED_EMAIL })
    );

    await waitFor(() =>
      expect(saved).toEqual([
        [{ event_key: "workflow.approved", email_enabled: false }],
      ])
    );
  });

  it("saves a bell choice on its own", async () => {
    const saved: unknown[] = [];
    const prefs = [
      {
        event_key: "workflow.approved",
        label: "Your request was approved",
        description: "Your request completed its approval chain.",
        email_mutable: true,
        email_enabled: true,
        bell_mutable: true,
        bell_enabled: true,
        urgent: false,
      },
    ];
    server.use(
      http.get(`${BASE}/api/v1/notifications/preferences`, () =>
        HttpResponse.json(prefs)
      ),
      http.put(
        `${BASE}/api/v1/notifications/preferences`,
        async ({ request }) => {
          saved.push(await request.json());
          return HttpResponse.json([{ ...prefs[0], bell_enabled: false }]);
        }
      )
    );
    wrap(<NotificationPreferences />);

    fireEvent.click(
      await screen.findByRole("switch", { name: REQUEST_APPROVED_BELL })
    );

    await waitFor(() =>
      expect(saved).toEqual([
        [{ event_key: "workflow.approved", bell_enabled: false }],
      ])
    );
  });
});
