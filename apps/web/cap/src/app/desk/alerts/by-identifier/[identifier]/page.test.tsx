import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportError } from "@/lib/report-error";
import { deskAlert } from "@/test/desk-alert.fixture";
import { staffGate } from "@/test/desk-gate.fixture";
import DeskAlertByIdentifierPage from "./page";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const ID = "11111111-2222-4333-8444-555555555555";
const IDENTIFIER = "urn:example:alert";
const API_PATH = "/api/v1/cap/alerts/by-identifier/";
const DESK_PATH = "/desk/alerts/by-identifier/";
const staff = staffGate();
const fetchAlert = vi.fn<(_request: Request) => Promise<Response>>();

function page(identifier = IDENTIFIER) {
  return DeskAlertByIdentifierPage({ params: Promise.resolve({ identifier }) });
}

function matchingAlert(identifier: string) {
  return Response.json(
    deskAlert({
      created_by_user_id: staff.userId,
      id: ID,
      identifier,
      info: [],
      updated_by_user_id: null,
    })
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  gate.requireDeskGate.mockResolvedValue(staff);
  vi.stubGlobal("fetch", fetchAlert);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/desk/alerts/by-identifier/[identifier]", () => {
  it("looks up the alert with the staff token and redirects to its UUID", async () => {
    fetchAlert.mockResolvedValue(matchingAlert(IDENTIFIER));

    await expect(page()).rejects.toMatchObject({
      digest: `NEXT_REDIRECT;replace;/desk/alerts/${ID};307;`,
    });

    expect(gate.requireDeskGate).toHaveBeenCalledWith(
      `${DESK_PATH}urn%3Aexample%3Aalert`
    );
    const request = fetchAlert.mock.calls[0]?.[0];
    expect(request?.headers.get("authorization")).toBe("Bearer token-test");
    expect(request?.cache).toBe("no-store");
  });

  it("returns not found when the alert does not exist", async () => {
    fetchAlert.mockResolvedValue(Response.json({}, { status: 404 }));

    await expect(page()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  it("shows the desk refusal when the API refuses the read", async () => {
    fetchAlert.mockResolvedValue(Response.json({}, { status: 403 }));

    render(await page());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No access to CAP warnings"
    );
  });

  it("does not look up the alert if the desk gate refuses access", async () => {
    gate.requireDeskGate.mockResolvedValue({
      status: "refused",
      email: staff.email,
    });

    render(await page());
    expect(screen.getByRole("alert")).toHaveTextContent(staff.email);
    expect(fetchAlert).not.toHaveBeenCalled();
  });

  it("reports a service failure and shows that the alert is unavailable", async () => {
    fetchAlert.mockResolvedValue(Response.json({}, { status: 503 }));

    render(await page());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This alert could not be loaded"
    );
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 503 }),
      "cap-desk-alert-by-identifier"
    );
  });

  it("sends colons and slashes as one encoded path segment", async () => {
    const encoded = "urn%3Aexample%3Aalert%2Fupdate";
    const identifier = decodeURIComponent(encoded);
    fetchAlert.mockResolvedValue(matchingAlert(identifier));

    await expect(page(identifier)).rejects.toMatchObject({
      digest: `NEXT_REDIRECT;replace;/desk/alerts/${ID};307;`,
    });

    expect(gate.requireDeskGate).toHaveBeenCalledWith(DESK_PATH + encoded);
    const request = fetchAlert.mock.calls[0]?.[0];
    expect(request?.url).toBe(`http://localhost:8000${API_PATH}${encoded}`);
  });
});
