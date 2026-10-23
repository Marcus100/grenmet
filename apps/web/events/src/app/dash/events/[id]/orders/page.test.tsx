import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LISTING_ID, makeOrderRow } from "@/test/org-factories";

const RE_1 = /No orders/;
const RE_2 = /isn't linked/;

const getManagedOrganiser = vi.fn();
const resolveOrgContext = vi.fn();
const getOrgOrders = vi.fn();

vi.mock("@/data/events-api", () => ({
  getManagedOrganiser: () => getManagedOrganiser(),
}));
vi.mock("@/data/org-context", () => ({
  resolveOrgContext: () => resolveOrgContext(),
}));
vi.mock("@/data/org-orders", () => ({
  getOrgOrders: (...args: unknown[]) => getOrgOrders(...args),
}));
vi.mock("@/components/dash/no-organiser-access", () => ({
  NoOrganiserAccess: () => <p>No access</p>,
}));
vi.mock("@/data/viewer", () => ({ requireViewer: vi.fn() }));
vi.mock("@/components/dash/dash-shell", () => ({
  DashShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import OrdersPage from "./page";

const managed = {
  organiser: { slug: "o", organisationId: "org_1" },
  organisers: [],
  listings: [{ id: LISTING_ID, title: "Fete", tiers: [] }],
};

function show(search: { page?: string; status?: string } = {}) {
  return OrdersPage({
    params: Promise.resolve({ id: LISTING_ID }),
    searchParams: Promise.resolve(search),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getManagedOrganiser.mockResolvedValue(managed);
  resolveOrgContext.mockResolvedValue({
    ok: true,
    accessToken: "t",
    organisationId: "org_1",
  });
});

describe("Orders page", () => {
  it("passes a valid status and page to the API", async () => {
    getOrgOrders.mockResolvedValue({
      kind: "ok",
      value: { rows: [makeOrderRow()], count: 1, page: 2, totalPages: 2 },
    });
    render(await show({ status: "confirmed", page: "2" }));
    expect(getOrgOrders).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: "org_1" }),
      LISTING_ID,
      { page: 2, status: "confirmed" }
    );
    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.getByText("Ana Tester")).toBeInTheDocument();
  });

  it("drops an unknown status instead of forwarding it", async () => {
    getOrgOrders.mockResolvedValue({
      kind: "ok",
      value: { rows: [], count: 0, page: 1, totalPages: 1 },
    });
    render(await show({ status: "bogus" }));
    expect(getOrgOrders).toHaveBeenCalledWith(expect.anything(), LISTING_ID, {
      page: 1,
    });
    expect(screen.getByRole("status")).toHaveTextContent(RE_1);
  });

  it("is a 404 for an event the organiser does not own", async () => {
    getManagedOrganiser.mockResolvedValue({ ...managed, listings: [] });
    const error = await show().catch((caught: unknown) => caught);
    expect(error instanceof Error ? error.message : null).toBe("not-found");
  });

  it("says so, without calling the API, when the organiser has no organisation", async () => {
    resolveOrgContext.mockResolvedValue({
      ok: false,
      reason: "no-organisation",
    });
    render(await show());
    expect(getOrgOrders).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(RE_2);
  });

  it("shows a no-access state instead of throwing on a 403", async () => {
    getOrgOrders.mockResolvedValue({ kind: "forbidden" });
    render(await show());
    expect(screen.getByRole("status")).toHaveTextContent("access to orders");
  });
});
