import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AviationDraft } from "./aviation-draft";

vi.mock("@/components/document/document-preview", () => ({
  DocumentPreview: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/document/paper", () => ({
  Paper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const CONFLICT = /Reload it before saving/;
const SAVED = /Revision 1 saved to FastAPI/;
const IMPORTED = /Browser draft loaded as a new unsaved draft/;
const ID = "11111111-1111-4111-8111-111111111111";
const saved = {
  id: ID,
  revision: 1,
  kind: "METAR",
  station: "TGPY",
  message: "METAR TGPY old=",
  observed_at: "2026-09-17T12:00:45+0000",
  issued_at: null,
  valid_from: null,
  valid_to: null,
  actor_id: ID,
  actor_name: "Forecaster",
  updated_at: "2026-09-17T13:00:00+0000",
  state: "draft",
  time_basis: "staff_supplied",
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
function typeMessage(message: string) {
  fireEvent.change(screen.getByLabelText("Coded message (UTC time groups)"), {
    target: { value: message },
  });
}

it("saves a draft with a fresh CSRF token, explicit UTC time, and unknown times left null", async () => {
  let posted: Record<string, unknown> = {};
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("browser-session"))
      return Promise.resolve(json({ csrfToken: "token", userId: ID }));
    posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("token");
    return Promise.resolve(
      json({
        ...saved,
        id: posted.id,
        message: posted.message,
        observed_at: posted.observed_at,
      })
    );
  });
  vi.stubGlobal("fetch", fetcher);
  render(<AviationDraft />);
  typeMessage("METAR TGPY draft=");
  fireEvent.change(screen.getByLabelText("Observation time (UTC)"), {
    target: { value: "2026-09-17T12:00" },
  });
  fireEvent.click(screen.getByText("Save draft"));
  await screen.findByText(SAVED);
  expect(posted).toMatchObject({
    expected_revision: 0,
    observed_at: "2026-09-17T12:00:00.000Z",
    issued_at: null,
    valid_from: null,
    valid_to: null,
  });
});

it("preserves edited text on a stale revision conflict", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("browser-session"))
        return Promise.resolve(json({ csrfToken: "token", userId: ID }));
      if (!init?.method) return Promise.resolve(json({ drafts: [saved] }));
      return Promise.resolve(
        json({ detail: "This product changed. Reload it before saving." }, 409)
      );
    })
  );
  render(<AviationDraft />);
  fireEvent.click(screen.getByText("Load saved drafts"));
  fireEvent.click(
    await screen.findByText(`Revision 1 · ${saved.updated_at} · Forecaster`)
  );
  typeMessage("My unsaved correction");
  fireEvent.click(screen.getByText("Save draft"));
  await screen.findByText(CONFLICT);
  expect(screen.getByLabelText("Coded message (UTC time groups)")).toHaveValue(
    "My unsaved correction"
  );
});

it("imports local text without removing the original or saving automatically", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  localStorage.setItem("gms-aviation-draft:METAR:TGPY", "Old browser draft");
  render(<AviationDraft />);
  fireEvent.click(screen.getByText("Import browser draft"));
  await screen.findByText(IMPORTED);
  expect(screen.getByLabelText("Coded message (UTC time groups)")).toHaveValue(
    "Old browser draft"
  );
  expect(localStorage.getItem("gms-aviation-draft:METAR:TGPY")).toBe(
    "Old browser draft"
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("keeps seconds when loading an existing draft and prompts before replacing edits", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ drafts: [saved] }))
  );
  render(<AviationDraft />);
  fireEvent.click(screen.getByText("Load saved drafts"));
  fireEvent.click(
    await screen.findByText(`Revision 1 · ${saved.updated_at} · Forecaster`)
  );
  expect(screen.getByLabelText("Observation time (UTC)")).toHaveValue(
    "2026-09-17T12:00:45.000"
  );
  typeMessage("Unsaved");
  fireEvent.click(screen.getByText("TAF"));
  await screen.findByText(
    "Save your changes or discard them before switching drafts."
  );
  expect(screen.getByLabelText("Coded message (UTC time groups)")).toHaveValue(
    "Unsaved"
  );
  fireEvent.click(screen.getByText("Discard unsaved changes"));
  expect(screen.getByLabelText("Coded message (UTC time groups)")).toHaveValue(
    saved.message
  );
});
