import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NotificationBell } from "./notification-bell";
import { NotificationPreferences } from "./notification-preferences";

const APPROVAL_WAITING = /Approval waiting for you/;
const REQUEST_APPROVED = /Your request was approved/;

const BASE = "http://localhost";
const BELL_UNREAD = /Notifications, 2 unread/;

const unreadItem = {
  id: "n1",
  event_key: "workflow.step_awaiting",
  title: "Leave request waiting for your approval",
  body: "Jane Charles — Vacation, 12 Oct 2026 to 16 Oct 2026",
  link_path: null,
  entity_type: "leave_request",
  entity_id: "l1",
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
  }, 20_000);
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
      },
      {
        event_key: "workflow.approved",
        label: "Your request was approved",
        description: "Your request completed its approval chain.",
        email_mutable: true,
        email_enabled: true,
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
          ]);
        }
      )
    );
    wrap(<NotificationPreferences />);

    const locked = await screen.findByRole("switch", {
      name: APPROVAL_WAITING,
    });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("switch", { name: REQUEST_APPROVED }));

    await waitFor(() =>
      expect(saved).toEqual([
        [{ event_key: "workflow.approved", email_enabled: false }],
      ])
    );
  }, 20_000);
});
