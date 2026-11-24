import type { CapAlertPublicView } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAlert } from "@/lib/cap-api";
import AlertPage from "./page";

vi.mock("@/lib/cap-api", () => ({ fetchAlert: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

const ORANGE_STRIP = /Orange · Be prepared · High wind/u;
const ENDED = /Ended/u;
const WAS_ORANGE = /Was Orange · Be prepared/u;
const NO_LONGER = /no longer in force/u;
const NEWER = /the newer warning/u;

function alert(
  top: Record<string, unknown> = {},
  info: Record<string, unknown> = {}
): CapAlertPublicView {
  return {
    identifier: "w1",
    lifecycle_state: "PUBLISHED",
    msg_type: "Alert",
    sent: "2026-10-18T12:00:00Z",
    status: "Actual",
    updated_at: "2026-10-18T12:00:00Z",
    info: [
      {
        areas: [{ area_desc: "Grenada" }],
        certainty: "Likely",
        description: "Strong wind",
        event: "High wind",
        expires: "2099-10-18T20:00:00Z",
        headline: "High wind warning",
        language: "en",
        severity: "Severe",
        urgency: "Expected",
        ...info,
      },
    ],
    ...top,
  } as unknown as CapAlertPublicView;
}

function ok(data: CapAlertPublicView) {
  return { data, fetchedAt: new Date(), status: "ok" as const };
}

async function renderPage(id = "w1") {
  render(await AlertPage({ params: Promise.resolve({ id }) }));
}

beforeEach(() => {
  vi.mocked(fetchAlert).mockReset();
});

describe("alert page", () => {
  it("opens an active warning with the issued colour and no Ended strip", async () => {
    vi.mocked(fetchAlert).mockResolvedValue(ok(alert()));
    await renderPage();
    expect(screen.getByText(ORANGE_STRIP)).toBeVisible();
    expect(screen.queryByText(ENDED)).toBeNull();
  });

  it("opens an expired warning with a grey Ended strip and the colour as a tag", async () => {
    vi.mocked(fetchAlert).mockResolvedValue(
      ok(alert({}, { expires: "2026-10-18T13:00:00Z" }))
    );
    await renderPage();
    expect(screen.getByText(ENDED)).toHaveTextContent("Ended ·");
    expect(screen.getByText(WAS_ORANGE)).toBeVisible();
    expect(screen.getByText(NO_LONGER)).toBeVisible();
  });

  it("treats a replaced warning as ended even before it expires", async () => {
    vi.mocked(fetchAlert).mockImplementation((identifier) =>
      Promise.resolve(
        identifier === "w2"
          ? ok(alert({ identifier: "w2", sent: "2026-10-18T15:00:00Z" }))
          : ok(alert({ replaced_by_identifier: "w2" }))
      )
    );
    await renderPage();
    expect(screen.getByText(ENDED)).toHaveTextContent("Ended ·");
    expect(screen.getByText(NEWER)).toHaveAttribute("href", "/alerts/w2");
    expect(screen.getByText(WAS_ORANGE)).toBeVisible();
  });
});
