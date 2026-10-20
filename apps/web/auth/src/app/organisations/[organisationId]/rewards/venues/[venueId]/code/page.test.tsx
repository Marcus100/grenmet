// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listMyOrganisations = vi.hoisted(() => vi.fn());
const listVenues = vi.hoisted(() => vi.fn());
const getVenueQrToken = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
);
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  })
);

vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/account", () => ({
  requireAccount: vi.fn().mockResolvedValue({ access_token: "access" }),
}));
vi.mock("@/lib/account-organisations", () => ({ listMyOrganisations }));
vi.mock("@/lib/org-rewards", () => ({ getVenueQrToken, listVenues }));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/components/account-layout", () => ({
  AccountLayout: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/components/org-rewards/venue-code-display", () => ({
  VenueCodeDisplay: ({
    initial,
    refreshUrl,
  }: {
    initial: { token: string } | null;
    refreshUrl: string;
  }) => (
    <p data-refresh={refreshUrl} data-testid="display">
      {initial?.token ?? "no first code"}
    </p>
  ),
}));

import Page from "./page";

const VENUE = "11111111-1111-4111-8111-111111111111";

async function show(venueId = VENUE) {
  render(
    await Page({
      params: Promise.resolve({ organisationId: "org_1", venueId }),
    })
  );
}

async function failure(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    return error instanceof Error ? error.message : "non-error";
  }
  return "no error";
}

function apiError(status: number, detail = "x") {
  return Object.assign(new Error(detail), { data: { detail }, status });
}

function setUp() {
  listMyOrganisations.mockResolvedValue([
    { organisation: { id: "org_1" }, role: "admin" },
  ]);
  listVenues.mockResolvedValue([{ active: true, id: VENUE, name: "Market" }]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("venue code page", () => {
  it("fetches the first code on the server and polls the proxy route", async () => {
    setUp();
    getVenueQrToken.mockResolvedValue({
      refresh_after_seconds: 30,
      token: "v1.abc.1.def",
      window_seconds: 60,
    });
    await show();
    expect(getVenueQrToken).toHaveBeenCalledWith("access", "org_1", VENUE);
    const display = screen.getByTestId("display");
    expect(display.textContent).toBe("v1.abc.1.def");
    expect(display.getAttribute("data-refresh")).toBe(
      `/api/organisations/org_1/rewards/venues/${VENUE}/qr-token`
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Check-in code: Market"
    );
  });

  it("never puts the code in a link or the refresh URL", async () => {
    setUp();
    getVenueQrToken.mockResolvedValue({
      refresh_after_seconds: 30,
      token: "v1.abc.1.def",
      window_seconds: 60,
    });
    await show();
    const urls = [
      ...document.querySelectorAll("a"),
      ...document.querySelectorAll("[data-refresh]"),
    ].map(
      (node) => node.getAttribute("href") ?? node.getAttribute("data-refresh")
    );
    expect(urls.join(" ")).not.toContain("v1.abc");
  });

  it("explains a 403 instead of showing a code", async () => {
    setUp();
    getVenueQrToken.mockRejectedValue(apiError(403, "Forbidden"));
    await show();
    expect(screen.getByRole("alert").textContent).toContain(
      "Only owners and admins"
    );
    expect(screen.queryByTestId("display")).toBeNull();
  });

  it("lets the screen retry when the first fetch fails briefly, and reports it", async () => {
    setUp();
    const outage = apiError(503);
    getVenueQrToken.mockRejectedValue(outage);
    await show();
    expect(screen.getByTestId("display").textContent).toBe("no first code");
    expect(reportError).toHaveBeenCalledWith(outage, "org-rewards-venue-code");
  });

  it("is a 404 for an unknown venue, a bad id or someone else's organisation", async () => {
    setUp();
    listVenues.mockResolvedValue([]);
    expect(await failure(show())).toBe("NOT_FOUND");
    expect(await failure(show("nope"))).toBe("NOT_FOUND");
    listMyOrganisations.mockResolvedValue([]);
    expect(await failure(show())).toBe("NOT_FOUND");
  });

  it("sends an expired session to sign in", async () => {
    setUp();
    listVenues.mockRejectedValue(apiError(401));
    expect(await failure(show())).toBe("REDIRECT:/?session=expired");
  });
});
