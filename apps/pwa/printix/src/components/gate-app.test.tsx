// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_ORIGIN, SECRET, SUMMARY } from "@/test/fixtures";

const envState = vi.hoisted(() => ({
  VITE_API_URL: "https://api.example.test",
}));

vi.mock("@/env", () => ({ env: envState }));
vi.mock("@/lib/scan-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan-api")>();
  return { ...actual, readSummary: vi.fn(), submitScan: vi.fn() };
});

import { GateApp } from "@/components/gate-app";
import { PAIRING_STORAGE_KEY } from "@/lib/pairing-store";
import { readSummary } from "@/lib/scan-api";

const readSummaryMock = vi.mocked(readSummary);

// jsdom has no matchMedia; the install hint on the welcome screen asks it.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: vi.fn((query: string) => ({ matches: false, media: query })),
});

function logSpies() {
  return [
    vi.spyOn(console, "log").mockImplementation(() => undefined),
    vi.spyOn(console, "info").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "error").mockImplementation(() => undefined),
  ];
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  readSummaryMock.mockReset();
  readSummaryMock.mockResolvedValue({ kind: "summary", summary: SUMMARY });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  envState.VITE_API_URL = "https://api.example.test";
});

describe("pairing link", () => {
  it("reads the secret from the fragment once under Strict Mode, stores it and clears the address bar", async () => {
    const logs = logSpies();
    window.history.replaceState(null, "", `/#pair=${SECRET}`);
    const replace = vi.spyOn(window.history, "replaceState");

    render(
      <StrictMode>
        <GateApp />
      </StrictMode>
    );

    expect(
      await screen.findByRole("heading", { name: SUMMARY.event.name })
    ).toBeInTheDocument();
    // Strict Mode runs effects twice; only the first run may touch the URL.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(SECRET);
    expect(localStorage.getItem(PAIRING_STORAGE_KEY)).toContain(SECRET);
    expect(readSummaryMock).toHaveBeenCalledWith({
      origin: API_ORIGIN,
      secret: SECRET,
    });
    // The secret is never logged, even though it reached the client.
    for (const spy of logs) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    }
  });

  it("opens a paired phone from its own storage when there is no fragment", async () => {
    localStorage.setItem(
      PAIRING_STORAGE_KEY,
      JSON.stringify({ secret: SECRET, savedAt: "2026-11-15T10:00:00Z" })
    );
    render(<GateApp />);
    expect(
      await screen.findByRole("heading", { name: SUMMARY.event.name })
    ).toBeInTheDocument();
  });

  it("explains a link that is not valid and keeps no secret from it", async () => {
    window.history.replaceState(null, "", "/#pair=not-a-real-secret");
    render(<GateApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This pairing link is not valid."
    );
    expect(localStorage.getItem(PAIRING_STORAGE_KEY)).toBeNull();
    expect(window.location.hash).toBe("");
    expect(readSummaryMock).not.toHaveBeenCalled();
  });

  it("shows the pairing screens when the server does not accept the pairing, and unpairs on request", async () => {
    localStorage.setItem(
      PAIRING_STORAGE_KEY,
      JSON.stringify({ secret: SECRET, savedAt: "2026-11-15T10:00:00Z" })
    );
    readSummaryMock.mockResolvedValue({
      kind: "pairing",
      problem: "revoked-or-expired",
    });
    render(<GateApp />);

    expect(
      await screen.findByRole("heading", { name: "Pairing no longer valid" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unpair this phone" }));

    expect(
      await screen.findByRole("heading", { name: "Printix Scanner" })
    ).toBeInTheDocument();
    expect(screen.getByText("Pair this phone")).toBeInTheDocument();
    expect(localStorage.getItem(PAIRING_STORAGE_KEY)).toBeNull();
  });

  it("says plainly when this build has no server address", async () => {
    envState.VITE_API_URL = "";
    localStorage.setItem(
      PAIRING_STORAGE_KEY,
      JSON.stringify({ secret: SECRET, savedAt: "2026-11-15T10:00:00Z" })
    );
    render(<GateApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "not connected to its server"
    );
    expect(readSummaryMock).not.toHaveBeenCalled();
  });
});

describe("pairing while open", () => {
  it("adopts a new pairing link opened in the same tab", async () => {
    render(<GateApp />);
    expect(
      await screen.findByRole("heading", { name: "Printix Scanner" })
    ).toBeInTheDocument();
    window.history.replaceState(null, "", `/#pair=${SECRET}`);
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() =>
      expect(localStorage.getItem(PAIRING_STORAGE_KEY)).toContain(SECRET)
    );
  });
});
