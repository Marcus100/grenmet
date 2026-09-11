import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadAlerts = vi.fn();
const loadProducts = vi.fn();
const loadImagery = vi.fn();
const loadHr = vi.fn();

vi.mock("./home-loaders", () => ({
  loadAlerts: () => loadAlerts(),
  loadHr: () => loadHr(),
  loadImagery: () => loadImagery(),
  loadProducts: () => loadProducts(),
}));

const { StatusStrip } = await import("./status-strip");

const ok = <T,>(data: T) => ({ data, ok: true as const });
const failed = (message: string) => ({ message, ok: false as const });

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-09T14:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function renderStrip() {
  render(await StatusStrip());
}

describe("StatusStrip", () => {
  it("counts live figures from every source", async () => {
    vi.useFakeTimers();
    loadAlerts.mockResolvedValue(
      ok({ count: 2, data: [{ id: "a" }, { id: "b" }] })
    );
    loadProducts.mockResolvedValue(
      ok([
        { id: "1", kind: "morning", values: { issuedAt: "2026-09-09T05:30" } },
        { id: "2", kind: "marine", values: { issuedAt: "2026-09-09T06:00" } },
      ])
    );
    loadImagery.mockResolvedValue(ok([]));
    loadHr.mockResolvedValue(
      ok({ approvals: [{ id: "x" }], open_requests: 4 })
    );

    await renderStrip();

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
    expect(screen.getByText("1 bulletin live")).toBeInTheDocument();
    expect(screen.getByText("4 open requests in total")).toBeInTheDocument();
    expect(screen.getByText("In effect")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("degrades each tile independently when its source is down", async () => {
    vi.useFakeTimers();
    loadAlerts.mockResolvedValue(failed("CAP feed unavailable"));
    loadProducts.mockResolvedValue(failed("wxproducts database unavailable"));
    loadImagery.mockResolvedValue(failed("WxWatch database unavailable"));
    loadHr.mockResolvedValue(ok({ approvals: [], open_requests: 1 }));

    await renderStrip();

    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("CAP feed unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("wxproducts database unavailable")
    ).toBeInTheDocument();
    // The one healthy source still renders its real figure.
    expect(screen.getByText("1 open request in total")).toBeInTheDocument();
  });
});
