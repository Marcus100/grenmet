import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEscalation: vi.fn(),
  listPublishedProducts: vi.fn(),
  reportError: vi.fn(),
  requireDeskGate: vi.fn(),
  suggestIbf: vi.fn(),
}));
vi.mock("@/lib/desk/gate", () => ({ requireDeskGate: mocks.requireDeskGate }));
vi.mock("@/lib/desk/api", () => ({
  getEscalation: mocks.getEscalation,
  listPublishedProducts: mocks.listPublishedProducts,
  suggestIbf: mocks.suggestIbf,
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));
// The form is a client component with its own tests; here the stub shows what
// the page hands it, so the page's wiring is what is checked.
vi.mock("@/components/desk/raise-to-warning-form", () => ({
  RaiseToWarningForm: ({
    label,
    productId,
    revision,
    suggestion,
  }: {
    label: string;
    productId: string;
    revision: number;
    suggestion: { kind: string; colour?: string };
  }) => (
    <div>
      form · {label} · {productId} · revision {revision} · {suggestion.kind}
      {suggestion.colour ? ` ${suggestion.colour}` : ""}
    </div>
  ),
}));

import GmsAlertsPage from "./page";

const FLOOD_ID = "11111111-2222-4333-8444-555555555555";
const WIND_ID = "22222222-3333-4444-8555-666666666666";
const ALERT_ID = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const STAFF = {
  accessToken: "t",
  email: "forecaster@example.org",
  permissions: { create: true, read: true },
  status: "staff",
  userId: "u1",
};

function product(id: string, kind: string, values: Record<string, string>) {
  return {
    id,
    kind,
    publishedAt: "2026-11-23T08:00:00Z",
    revision: 3,
    values,
  };
}

const FLOOD = product(FLOOD_ID, "flood", {
  impact: "Severe",
  likelihood: "High",
  validFrom: "2026-11-23T06:00",
  validTo: "2026-11-24T07:00",
});

async function renderPage() {
  render(await GmsAlertsPage());
}

const NONE_TO_RAISE_TEXT =
  /No GMS alerts are in force, so there is nothing to raise/u;
const OUTLOOK_NAME = /outlook/iu;
const FORM_STUB_TEXT = /form ·/u;
const ALREADY_RAISED_TEXT =
  /A warning was already raised from this alert, and it is waiting for approval/u;
const CHECK_FAILED_TEXT =
  /Could not check whether a warning was already raised/u;

describe("GMS alerts page", () => {
  beforeEach(() => {
    mocks.getEscalation.mockReset();
    mocks.listPublishedProducts.mockReset();
    mocks.reportError.mockReset();
    mocks.requireDeskGate.mockReset();
    mocks.suggestIbf.mockReset();
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.getEscalation.mockResolvedValue({
      alert_id: null,
      lifecycle_state: null,
    });
    mocks.suggestIbf.mockResolvedValue({ colour: "orange" });
  });

  it("shows the refused panel to a signed-in account without warning access", async () => {
    mocks.requireDeskGate.mockResolvedValue({
      email: "viewer@example.org",
      status: "refused",
    });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: "No access to CAP warnings" })
    ).toBeInTheDocument();
    expect(mocks.listPublishedProducts).not.toHaveBeenCalled();
  });

  it("refuses an account that can read but not create warnings", async () => {
    mocks.requireDeskGate.mockResolvedValue({
      ...STAFF,
      permissions: { create: false, read: true },
    });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: "No access to CAP warnings" })
    ).toBeInTheDocument();
    expect(mocks.listPublishedProducts).not.toHaveBeenCalled();
  });

  it("says plainly when the GMS alert list cannot be loaded", async () => {
    mocks.listPublishedProducts.mockRejectedValue(new Error("down"));
    await renderPage();
    expect(
      screen.getByRole("heading", {
        name: "The GMS alert list could not be loaded",
      })
    ).toBeInTheDocument();
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "cap-desk-escalations"
    );
  });

  it("shows none-to-raise when no hazard alert is in force", async () => {
    mocks.listPublishedProducts.mockResolvedValue({
      products: [
        product("c0c0c0c0-0000-4000-8000-000000000001", "morning", {}),
      ],
    });
    await renderPage();
    expect(screen.getByText(NONE_TO_RAISE_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FORM_STUB_TEXT)).not.toBeInTheDocument();
    expect(mocks.getEscalation).not.toHaveBeenCalled();
  });

  it("offers Raise to warning for an alert with no warning yet, with the matrix colour", async () => {
    mocks.listPublishedProducts.mockResolvedValue({ products: [FLOOD] });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: "Flood / Heavy Rain" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Valid 23 Nov 2026, 06:00 to 24 Nov 2026, 07:00 (Grenada time)."
      )
    ).toBeInTheDocument();
    expect(mocks.suggestIbf).toHaveBeenCalledWith("t", {
      impact: "Severe",
      kind: "flood",
      likelihood: "High",
    });
    expect(
      screen.getByText(
        `form · Flood / Heavy Rain · ${FLOOD_ID} · revision 3 · suggested orange`
      )
    ).toBeInTheDocument();
  });

  it("does not offer a raise for a non-hazard product", async () => {
    mocks.listPublishedProducts.mockResolvedValue({
      products: [
        product("c0c0c0c0-0000-4000-8000-000000000001", "outlook", {}),
        product(WIND_ID, "wind", {}),
      ],
    });
    await renderPage();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Wind" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: OUTLOOK_NAME })
    ).not.toBeInTheDocument();
  });

  it("shows an already-raised alert with its state and a link, and no raise button", async () => {
    mocks.listPublishedProducts.mockResolvedValue({ products: [FLOOD] });
    mocks.getEscalation.mockResolvedValue({
      alert_id: ALERT_ID,
      lifecycle_state: "SUBMITTED",
    });
    await renderPage();
    expect(screen.getByText(ALREADY_RAISED_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the warning" })
    ).toHaveAttribute("href", `/desk/alerts/${ALERT_ID}`);
    expect(screen.queryByText(FORM_STUB_TEXT)).not.toBeInTheDocument();
    expect(mocks.suggestIbf).not.toHaveBeenCalled();
  });

  it("says a failed check is not a go-ahead, and offers no raise", async () => {
    mocks.listPublishedProducts.mockResolvedValue({ products: [FLOOD] });
    mocks.getEscalation.mockRejectedValue(new Error("upstream"));
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(CHECK_FAILED_TEXT);
    expect(screen.queryByText(FORM_STUB_TEXT)).not.toBeInTheDocument();
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "cap-desk-escalations"
    );
  });

  it("still offers the raise when only the matrix check fails, with the colour unknown", async () => {
    mocks.listPublishedProducts.mockResolvedValue({ products: [FLOOD] });
    mocks.suggestIbf.mockRejectedValue(new Error("matrix down"));
    await renderPage();
    expect(
      screen.getByText(
        `form · Flood / Heavy Rain · ${FLOOD_ID} · revision 3 · unknown`
      )
    ).toBeInTheDocument();
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "cap-desk-escalations"
    );
  });

  it("offers the raise with no matrix suggestion when likelihood and impact are not saved", async () => {
    mocks.listPublishedProducts.mockResolvedValue({
      products: [product(FLOOD_ID, "flood", { validFrom: "", validTo: "" })],
    });
    await renderPage();
    expect(
      screen.getByText(
        `form · Flood / Heavy Rain · ${FLOOD_ID} · revision 3 · none`
      )
    ).toBeInTheDocument();
    expect(mocks.suggestIbf).not.toHaveBeenCalled();
  });
});
