import type {
  RequisitionLinePublic,
  RequisitionPublic,
} from "@barrelsgd/api-client";
import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RequisitionCard } from "./RequisitionCard";

const BASE = "http://localhost";
const PENS_LABEL = /Pens/u;
const REQUISITION_ID = "0f0c4c46-6b0c-4c3e-9f55-2d3f7e0b1a11";
const LINE_ID = "7d3f2c1e-1b6a-4f43-8a52-6a4d2b9c0e22";
const LOCATION_ID = "5b9d8f40-2f1c-4a76-9c3e-1e2f3a4b5c66";

function line(overrides: Partial<RequisitionLinePublic> = {}) {
  return {
    id: LINE_ID,
    item_id: "22222222-2222-4222-8222-222222222222",
    sku: "PEN-1",
    item_name: "Pens",
    category: "Stationery",
    unit: "box",
    requested_quantity: 10,
    approved_quantity: null,
    delivered_quantity: 0,
    ...overrides,
  } as RequisitionLinePublic;
}

function requisition(overrides: Partial<RequisitionPublic> = {}) {
  return {
    id: REQUISITION_ID,
    number: 7,
    reference: "REQ-00007",
    status: "SUBMITTED",
    organisation_id: "gaa",
    department_id: "ops",
    department_name: "Operations",
    requester_user_id: "11111111-1111-4111-8111-111111111111",
    requester_name: "Ada Joseph",
    purpose: "Office use",
    needed_by: null,
    lines: [line()],
    submitted_at: "2026-10-17T10:00:00Z",
    decided_at: null,
    decided_by_user_id: null,
    decision_note: null,
    delivered_at: null,
    created_at: "2026-10-17T10:00:00Z",
    updated_at: "2026-10-17T10:00:00Z",
    can_edit: false,
    can_cancel: false,
    can_approve: false,
    can_deliver: false,
    ...overrides,
  } as RequisitionPublic;
}

let received: unknown;
const server = setupServer(
  http.post(
    `${BASE}/api/v1/stores/requisitions/${REQUISITION_ID}/approve`,
    async ({ request }) => {
      received = await request.json();
      return HttpResponse.json(requisition({ status: "APPROVED" }));
    }
  ),
  http.post(
    `${BASE}/api/v1/stores/requisitions/${REQUISITION_ID}/deliver`,
    async ({ request }) => {
      received = await request.json();
      return HttpResponse.json(requisition({ status: "PARTIALLY_DELIVERED" }));
    }
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  router.refresh.mockClear();
});
afterAll(() => server.close());

function renderCard(value: RequisitionPublic) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RequisitionCard
        locations={[
          {
            id: LOCATION_ID,
            code: "MAIN",
            name: "Main store",
            is_active: true,
          },
        ]}
        requisition={value}
      />
    </QueryClientProvider>
  );
}

describe("RequisitionCard", () => {
  it("shows the reference, status and lines without actions the caller lacks", () => {
    renderCard(requisition());

    expect(screen.getByText("REQ-00007")).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
    expect(screen.getByText("Pens")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers only the actions the API allows", () => {
    renderCard(requisition({ can_approve: true }));

    expect(screen.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reject" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Deliver" })
    ).not.toBeInTheDocument();
  });

  it("approves with per-line quantities", async () => {
    renderCard(requisition({ can_approve: true }));

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.change(screen.getByLabelText(PENS_LABEL), {
      target: { value: "6" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Approve",
      })
    );

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(received).toEqual({
      lines: [{ line_id: LINE_ID, approved_quantity: 6 }],
      note: null,
    });
  });

  it("delivers what is still outstanding from the chosen location", async () => {
    const approved = requisition({
      status: "APPROVED",
      can_deliver: true,
      lines: [line({ approved_quantity: 10, delivered_quantity: 4 })],
    });
    renderCard(approved);

    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));
    expect(screen.getByLabelText(PENS_LABEL)).toHaveValue(6);
    fireEvent.click(screen.getByRole("button", { name: "Record delivery" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(received).toEqual({
      location_id: LOCATION_ID,
      lines: [{ line_id: LINE_ID, quantity: 6 }],
      note: null,
    });
  });

  it("links a draft to its editor and calls cancelling a draft discarding", () => {
    renderCard(
      requisition({ status: "DRAFT", can_edit: true, can_cancel: true })
    );

    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/salesbus/sales/drafts/${REQUISITION_ID}`
    );
    expect(screen.getByRole("button", { name: "Submit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Discard" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Cancel" })
    ).not.toBeInTheDocument();
  });
});
