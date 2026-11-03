import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, ORG_ID, session } from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(() => Promise.resolve(session)),
}));
vi.mock("@/lib/studio-api", () => ({ listMyOrganisations: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import { listMyOrganisations } from "@/lib/studio-api";
import StudioPage from "./page";

const EMAIL = /maya@example.com/u;
const PALM = /Palm Studio/u;
const org = (slug: string, name: string) => ({
  id: ORG_ID,
  name,
  slug,
  role: "member" as const,
});

beforeEach(() => {
  vi.mocked(listMyOrganisations).mockReset();
  reportError.mockReset();
});

describe("studio organisation picker", () => {
  it("goes straight to the agenda when there is exactly one business", async () => {
    vi.mocked(listMyOrganisations).mockResolvedValue([
      org("sea-salt", "Sea Salt"),
    ]);
    await expect(StudioPage()).rejects.toHaveProperty(
      "message",
      "NEXT_REDIRECT /studio/sea-salt/agenda"
    );
  });

  it("explains how to get access when there are none", async () => {
    vi.mocked(listMyOrganisations).mockResolvedValue([]);
    render(await StudioPage());
    expect(
      screen.getByText("You are not part of a business yet")
    ).toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See how Barrels Bookings works" })
    ).toHaveAttribute("href", "/");
  });

  it("lists each business with its role when there are several", async () => {
    vi.mocked(listMyOrganisations).mockResolvedValue([
      org("sea-salt", "Sea Salt"),
      org("palm", "Palm Studio"),
    ]);
    render(await StudioPage());
    const link = screen.getByRole("link", { name: PALM });
    expect(link).toHaveAttribute("href", "/studio/palm/agenda");
    expect(screen.getAllByText("Member")).toHaveLength(2);
  });

  it("sends an ended session to sign-in", async () => {
    vi.mocked(listMyOrganisations).mockRejectedValue(apiError(401));
    await expect(StudioPage()).rejects.toHaveProperty(
      "message",
      expect.stringContaining("NEXT_REDIRECT /signin?")
    );
  });

  it("reports and shows a next step when the API is down", async () => {
    vi.mocked(listMyOrganisations).mockRejectedValue(apiError(503));
    render(await StudioPage());
    expect(screen.getByRole("alert")).toHaveTextContent("Try again");
    expect(reportError).toHaveBeenCalledWith(expect.anything(), "studio");
  });
});
