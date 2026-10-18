import type { ItemPublic, RequisitionPublic } from "@barrelsgd/api-client";
import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DraftEditor } from "./DraftEditor";

const BASE = "http://localhost";
const ID = "0f0c4c46-6b0c-4c3e-9f55-2d3f7e0b1a11";
const PEN = "22222222-2222-4222-8222-222222222222";
const PAPER = "33333333-3333-4333-8333-333333333333";

const draft = {
  id: ID,
  reference: "REQ-00009",
  status: "DRAFT",
  purpose: "Office use",
  needed_by: "2026-11-01",
  can_edit: true,
  can_cancel: true,
  lines: [
    {
      id: "7d3f2c1e-1b6a-4f43-8a52-6a4d2b9c0e22",
      item_id: PEN,
      sku: "PEN-1",
      item_name: "Pens",
      unit: "box",
      requested_quantity: 4,
    },
  ],
} as unknown as RequisitionPublic;

const items = [
  { id: PEN, sku: "PEN-1", name: "Pens", unit: "box" },
  { id: PAPER, sku: "PAP-1", name: "Paper", unit: "ream" },
] as unknown as ItemPublic[];

const calls: string[] = [];
let patched: unknown;
const server = setupServer(
  http.patch(
    `${BASE}/api/v1/stores/requisitions/${ID}`,
    async ({ request }) => {
      calls.push("patch");
      patched = await request.json();
      return HttpResponse.json(draft);
    }
  ),
  http.post(`${BASE}/api/v1/stores/requisitions/${ID}/submit`, () => {
    calls.push("submit");
    return HttpResponse.json({ ...draft, status: "SUBMITTED" });
  }),
  http.post(`${BASE}/api/v1/stores/requisitions/${ID}/cancel`, () => {
    calls.push("cancel");
    return HttpResponse.json({ ...draft, status: "CANCELLED" });
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  calls.length = 0;
  router.push.mockClear();
  router.refresh.mockClear();
});
afterAll(() => server.close());

function renderEditor() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DraftEditor items={items} requisition={draft} />
    </QueryClientProvider>
  );
}

describe("DraftEditor", () => {
  it("saves edited purpose, date and lines without submitting", async () => {
    renderEditor();

    fireEvent.change(screen.getByDisplayValue("Office use"), {
      target: { value: "Revised" },
    });
    fireEvent.change(screen.getByLabelText("Add an item"), {
      target: { value: PAPER },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/salesbus/sales")
    );
    expect(calls).toEqual(["patch"]);
    expect(patched).toEqual({
      purpose: "Revised",
      needed_by: "2026-11-01",
      lines: [
        { item_id: PEN, quantity: 4 },
        { item_id: PAPER, quantity: 1 },
      ],
    });
  });

  it("saves then submits for approval", async () => {
    renderEditor();

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for approval" })
    );

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(calls).toEqual(["patch", "submit"]);
  });

  it("discards the draft", async () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(calls).toEqual(["cancel"]);
  });

  it("cannot be saved with no lines", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Remove Pens" }));

    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Submit for approval" })
    ).toBeDisabled();
  });
});
