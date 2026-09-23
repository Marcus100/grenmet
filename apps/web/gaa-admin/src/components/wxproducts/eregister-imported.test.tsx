import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookie: vi.fn(), fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-session", () => ({ readSessionCookie: mocks.cookie }));
vi.mock("@/lib/auth-config", () => ({
  getAuthApiBaseUrl: () => "http://api.test",
  getAuthApiPrefix: () => "/api/v1",
  getSessionCookieName: () => "session",
}));

import {
  ImportedObservations,
  loadImportedObservations,
  observationFilters,
} from "./eregister-imported";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.cookie.mockResolvedValue("opaque-secret");
});
afterEach(() => vi.unstubAllGlobals());

it("keeps UTC filters and forwards the session only to the configured service", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ observations: [] }));
  await loadImportedObservations({
    kind: "METAR",
    station: "TGPY",
    start: "2026-09-23T10:00",
  });
  const [url, options] = mocks.fetch.mock.calls[0];
  expect(url.pathname).toBe("/api/v1/wxproducts/observations");
  expect(url.searchParams.get("start")).toBe("2026-09-23T10:00:00.000Z");
  expect(url.searchParams.get("kind")).toBe("METAR");
  expect(options).toMatchObject({
    headers: { Cookie: "session=opaque-secret" },
    cache: "no-store",
    redirect: "error",
  });
});

it("rejects invalid filters and reversed dates before fetching", () => {
  for (const filters of [
    { kind: "TAF" },
    { limit: "501" },
    { start: "2026-02-30T10:00" },
    { start: "2026-09-24T10:00", end: "2026-09-23T10:00" },
  ]) {
    expect(() => observationFilters(filters)).toThrow();
  }
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("does not fetch without a session", async () => {
  mocks.cookie.mockResolvedValue(null);
  await expect(loadImportedObservations({})).rejects.toMatchObject({
    message: "Sign in to view imported observations.",
  });
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("shows unavailable rather than an empty archive for upstream failures", async () => {
  mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
  render(await ImportedObservations({ filters: {} }));
  expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
  expect(
    screen.queryByText("No imported observations match these filters.")
  ).not.toBeInTheDocument();
});

it("shows the empty state only for a valid empty response", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ observations: [] }));
  render(await ImportedObservations({ filters: {} }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "No imported observations"
  );
});

it("rejects a malformed response instead of fabricating an empty collection", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ rows: [] }));
  await expect(loadImportedObservations({})).rejects.toThrow();
});
