// @vitest-environment jsdom
import type { SecuritySessionPublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeSecuritySession } from "../security/actions";
import { SessionsList } from "./sessions-list";

vi.mock("../security/actions", () => ({ revokeSecuritySession: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1";

function session(
  id: string,
  userAgent: string,
  lastUsed: string
): SecuritySessionPublic {
  return {
    id,
    app_name: "auth",
    client_type: "web",
    user_agent: userAgent,
    ip_address: "203.0.113.7",
    last_used_at: lastUsed,
    expires_at: "2026-10-01T00:00:00Z",
  };
}

const sessions = [
  session("other", SAFARI_IPHONE, "2026-09-22T10:00:00Z"),
  session("current", CHROME_WINDOWS, "2026-09-23T10:00:00Z"),
];

describe("SessionsList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("puts this device first and does not offer to revoke it", () => {
    render(<SessionsList currentSessionId="current" sessions={sessions} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Chrome on Windows");
    expect(items[0]).toHaveTextContent("This device");
    expect(
      screen.queryByRole("button", { name: "Sign out Chrome on Windows" })
    ).toBeNull();
    expect(items[1]).toHaveTextContent("Safari on iOS");
  });

  it("removes a session once it is signed out", async () => {
    vi.mocked(revokeSecuritySession).mockResolvedValue(undefined as never);
    render(<SessionsList currentSessionId="current" sessions={sessions} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out Safari on iOS" })
    );
    await waitFor(() =>
      expect(screen.queryByText("Safari on iOS")).not.toBeInTheDocument()
    );
    expect(revokeSecuritySession).toHaveBeenCalledWith("other");
  });

  it("keeps a session that fails to sign out", async () => {
    vi.mocked(revokeSecuritySession).mockRejectedValue(new Error("stale"));
    render(<SessionsList currentSessionId="current" sessions={sessions} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out other sessions" })
    );
    await waitFor(() => expect(revokeSecuritySession).toHaveBeenCalled());
    expect(screen.getByText("Safari on iOS")).toBeInTheDocument();
  });
});
