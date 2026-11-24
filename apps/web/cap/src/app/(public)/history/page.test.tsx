import type { CapAlertPublicView } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fetchPast } from "@/lib/cap-api";
import HistoryPage from "./page";

vi.mock("@/lib/cap-api", () => ({ fetchPast: vi.fn() }));

const WAS_ORANGE = /Was Orange · Be prepared/u;
const WAS_NOT_STATED = /Was Severity not stated/u;
const ENDED_AT = /ended/u;

function past(identifier: string, severity: string): CapAlertPublicView {
  return {
    identifier,
    lifecycle_state: "EXPIRED",
    msg_type: "Alert",
    sent: "2026-10-18T12:00:00Z",
    status: "Actual",
    updated_at: "2026-10-18T14:00:00Z",
    expired_at: "2026-10-18T14:00:00Z",
    info: [
      {
        areas: [{ area_desc: "Grenada" }],
        description: "Wind",
        event: "High wind",
        headline: `Headline ${identifier}`,
        language: "en",
        severity,
      },
    ],
  } as unknown as CapAlertPublicView;
}

describe("history page", () => {
  it("writes past alerts in the past tense with the issued colour", async () => {
    vi.mocked(fetchPast).mockResolvedValue({
      data: [past("a", "Severe"), past("b", "Unknown")],
      fetchedAt: new Date(),
      status: "ok",
    });
    render(await HistoryPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(WAS_ORANGE)).toBeVisible();
    expect(screen.getByText(WAS_NOT_STATED)).toBeVisible();
    expect(screen.getAllByText(ENDED_AT)).toHaveLength(2);
    expect(screen.queryByText("Take action now")).toBeNull();
  });
});
