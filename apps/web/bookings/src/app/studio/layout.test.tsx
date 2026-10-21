import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "@/test/studio";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
  requireSession: vi.fn(() => {
    throw new Error("layout must not redirect");
  }),
}));

import { getSession } from "@/lib/session";
import StudioLayout from "./layout";

beforeEach(() => {
  vi.mocked(getSession).mockReset();
});

describe("studio layout", () => {
  it("shows the name and Sign out for a signed-in person", async () => {
    vi.mocked(getSession).mockResolvedValue(session);
    render(await StudioLayout({ children: <p>Page</p> }));
    expect(screen.getByText("Maya")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" })
    ).toBeInTheDocument();
    expect(screen.getByText("Page")).toBeInTheDocument();
  });

  it("leaves the header out, and does not redirect, without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    render(await StudioLayout({ children: <p>Page</p> }));
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.getByText("Page")).toBeInTheDocument();
  });
});
