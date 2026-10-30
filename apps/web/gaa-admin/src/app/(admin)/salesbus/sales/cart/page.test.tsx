import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { useEffect } from "react";
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
vi.mock("@/hooks/salesbus", () => ({ useIsTabletLandscape: () => false }));

import { CartProvider, useCart } from "@/lib/salesbus/cart-store";
import CartPage from "./page";

const BASE = "http://localhost";
const SAVE_AS_DRAFT = /SAVE AS DRAFT/u;
const SUBMIT_FOR_APPROVAL = /SUBMIT FOR APPROVAL/u;
const PEN = "22222222-2222-4222-8222-222222222222";

let received: unknown;
const server = setupServer(
  http.get(`${BASE}/api/v1/hr/profile/me`, () =>
    HttpResponse.json({
      employment: { department: { id: "dept_met", name: "Meteorology" } },
    })
  ),
  http.post(`${BASE}/api/v1/stores/requisitions`, async ({ request }) => {
    received = await request.json();
    return HttpResponse.json({ id: "x" }, { status: 201 });
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  router.push.mockClear();
});
afterAll(() => server.close());

function Seed() {
  const { addItem } = useCart();
  useEffect(() => {
    addItem({ itemId: PEN, sku: "PEN-1", name: "Pens", unit: "box" }, 3);
  }, [addItem]);
  return null;
}

function renderCart() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CartProvider>
        <Seed />
        <CartPage />
      </CartProvider>
    </QueryClientProvider>
  );
}

describe("cart page", () => {
  it("shows the requester's department from the staff profile", async () => {
    renderCart();

    expect(
      await screen.findByTestId("requisition-department")
    ).toHaveTextContent(
      "Requesting for: Meteorology (from your staff profile)"
    );
  });

  it("saves the cart as a draft without submitting it", async () => {
    renderCart();

    fireEvent.click(screen.getByRole("button", { name: SAVE_AS_DRAFT }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(received).toMatchObject({
      submit: false,
      lines: [{ item_id: PEN, quantity: 3 }],
    });
  });

  it("submits the cart for approval", async () => {
    renderCart();

    fireEvent.click(screen.getByRole("button", { name: SUBMIT_FOR_APPROVAL }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(received).toMatchObject({ submit: true });
  });
});
