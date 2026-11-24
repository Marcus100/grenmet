// @vitest-environment jsdom
import type { SecuritySessionPublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revokeSecuritySession } from "../security/actions";
import { SessionsList } from "./sessions-list";

vi.mock("../security/actions", () => ({ revokeSecuritySession: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SIGN_OUT_CHROME = /^Sign out Chrome on Windows/u;
const SIGN_OUT_SAFARI = /^Sign out Safari on iOS/u;
const LAST_ACTIVE_TWO = /Last active 2 minutes ago/u;

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1";

function session(
  id: string,
  userAgent: string,
  lastUsed: string,
  ip = "203.0.113.7"
): SecuritySessionPublic {
  return {
    id,
    app_name: "auth",
    client_type: "web",
    user_agent: userAgent,
    ip_address: ip,
    last_used_at: lastUsed,
    expires_at: "2026-10-01T00:00:00Z",
  };
}

const sessions = [
  session("other", SAFARI_IPHONE, "2026-09-22T10:00:00Z"),
  session("current", CHROME_WINDOWS, "2026-09-23T10:00:00Z"),
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SessionsList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("puts this device first and does not offer to revoke it", () => {
    render(<SessionsList currentSessionId="current" sessions={sessions} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Chrome on Windows");
    expect(items[0]).toHaveTextContent("This device");
    expect(screen.queryByRole("button", { name: SIGN_OUT_CHROME })).toBeNull();
    expect(items[1]).toHaveTextContent("Safari on iOS");
  });

  it("removes a session once it is signed out", async () => {
    vi.mocked(revokeSecuritySession).mockResolvedValue(undefined as never);
    render(<SessionsList currentSessionId="current" sessions={sessions} />);
    fireEvent.click(screen.getByRole("button", { name: SIGN_OUT_SAFARI }));
    await waitFor(() =>
      expect(screen.queryByText("Safari on iOS")).not.toBeInTheDocument()
    );
    expect(revokeSecuritySession).toHaveBeenCalledWith("other");
  });

  it("keeps a session that fails to sign out", async () => {
    vi.mocked(revokeSecuritySession).mockRejectedValue(new Error("stale"));
    render(<SessionsList currentSessionId="current" sessions={sessions} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out the other 1 device" })
    );
    await waitFor(() => expect(revokeSecuritySession).toHaveBeenCalled());
    expect(screen.getByText("Safari on iOS")).toBeInTheDocument();
  });

  it("renders the same server markup whatever the time, so hydration matches", () => {
    const now = vi.spyOn(Date, "now");
    const NOW = Date.parse("2026-09-23T10:01:00Z");

    now.mockReturnValue(NOW);
    const first = renderToString(
      <SessionsList currentSessionId="current" sessions={sessions} />
    );
    now.mockReturnValue(NOW + 60 * 60_000);
    const later = renderToString(
      <SessionsList currentSessionId="current" sessions={sessions} />
    );

    expect(later).toBe(first);
    expect(first).not.toContain("Last active");
  });

  it("fills in the relative time once the browser has mounted", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-22T10:02:00Z"));
    render(<SessionsList currentSessionId="current" sessions={sessions} />);

    expect(await screen.findByText(LAST_ACTIVE_TWO)).toBeInTheDocument();
  });

  it("gives each sign-out button its own name, even for the same device", () => {
    const twins = [
      session("current", CHROME_WINDOWS, "2026-09-23T10:00:00Z", "10.0.0.1"),
      session("twin-a", CHROME_WINDOWS, "2026-09-22T10:00:00Z", "10.0.0.2"),
      session("twin-b", CHROME_WINDOWS, "2026-09-21T10:00:00Z", "10.0.0.3"),
    ];
    render(<SessionsList currentSessionId="current" sessions={twins} />);

    const names = screen
      .getAllByRole("button", { name: SIGN_OUT_CHROME })
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toContain("10.0.0.2");
    expect(names[1]).toContain("10.0.0.3");
  });

  it("names the bulk sign-out by how many other devices it ends", () => {
    const three = [
      ...sessions,
      session("third", CHROME_WINDOWS, "2026-09-20T10:00:00Z"),
    ];
    render(<SessionsList currentSessionId="current" sessions={three} />);

    expect(
      screen.getByRole("button", { name: "Sign out the other 2 devices" })
    ).toBeInTheDocument();
  });
});
