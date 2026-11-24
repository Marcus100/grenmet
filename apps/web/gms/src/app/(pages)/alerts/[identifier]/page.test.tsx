import type { CapAlertPublicView } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublicAlert } from "@/lib/cap";
import WarningPage from "./page";

vi.mock("@/lib/cap", async () => ({
  ...(await vi.importActual<typeof import("@/lib/cap-alerts")>(
    "@/lib/cap-alerts"
  )),
  fetchPublicAlert: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const ORANGE_ACTIVE = /Orange · Be prepared/u;
const ENDED_AT = /Ended · .*AST/u;
const WAS_ORANGE = /Was Orange · Be prepared/u;

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

async function renderPage() {
  render(
    await WarningPage({
      params: Promise.resolve({ identifier: "w1" }),
      searchParams: Promise.resolve({}),
    })
  );
}

beforeEach(() => {
  vi.mocked(fetchPublicAlert).mockReset();
});

describe("weather site warning page", () => {
  it("prints the colour name beside the action words while in force", async () => {
    vi.mocked(fetchPublicAlert).mockResolvedValue({
      alert: alert(),
      status: "ok",
    });
    await renderPage();
    expect(screen.getByText(ORANGE_ACTIVE)).toBeInTheDocument();
  });

  it("opens an ended warning grey, with Ended, the Grenada time and a colour tag", async () => {
    vi.mocked(fetchPublicAlert).mockResolvedValue({
      alert: alert(
        { expired_at: "2026-10-18T13:00:00Z", lifecycle_state: "EXPIRED" },
        { expires: "2026-10-18T13:00:00Z" }
      ),
      status: "ok",
    });
    const { container } = await renderPageReturn();
    expect(screen.getByText(ENDED_AT)).toBeInTheDocument();
    expect(screen.getByText(WAS_ORANGE)).toBeInTheDocument();
    expect(container.querySelector(".bg-gm-warning-grey-bg")).not.toBeNull();
  });

  it("still redirects a replaced warning to its replacement", async () => {
    vi.mocked(fetchPublicAlert).mockResolvedValue({
      alert: alert({ replaced_by_identifier: "w2" }),
      status: "ok",
    });
    await expect(renderPage()).rejects.toThrow("redirect:");
  });

  it("shows an unstated severity in grey words", async () => {
    vi.mocked(fetchPublicAlert).mockResolvedValue({
      alert: alert({}, { severity: "Unknown" }),
      status: "ok",
    });
    await renderPage();
    expect(screen.getByText("Severity not stated")).toBeInTheDocument();
  });
});

async function renderPageReturn() {
  return render(
    await WarningPage({
      params: Promise.resolve({ identifier: "w1" }),
      searchParams: Promise.resolve({}),
    })
  );
}
