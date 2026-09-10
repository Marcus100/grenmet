import {
  type CapProfilePublic,
  type CapProfileSave,
  configureApiClient,
} from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { floodProfile } from "@/lib/cap-profile-defaults";
import { ProfileEditor } from "./profile-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const SAVE = "Save new draft version";
const BASE = "http://localhost/api/v1/cap/hazard-profiles";
let body: CapProfileSave | null = null;
function version(state: "DRAFT" | "APPROVED" = "DRAFT"): CapProfilePublic {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    key: "flood-heavy-rain",
    version: 1,
    definition: floodProfile(),
    state,
    created_by: "author",
    created_at: "2026-09-10T12:00:00Z",
    approved_by: null,
    approved_at: null,
    approval_errors: ["Set the issuing and reviewing authorities."],
  };
}
const server = setupServer(
  http.post(`${BASE}/flood-heavy-rain/versions`, async ({ request }) => {
    body = (await request.json()) as CapProfileSave;
    return HttpResponse.json(
      {
        ...version(),
        version: (body.base_version ?? 0) + 1,
        definition: body.definition,
      },
      { status: 201 }
    );
  })
);
beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  body = null;
});
afterAll(() => server.close());

describe("Hazard profile editor", () => {
  it("saves flood modules with unset thresholds and displays approval blockers", async () => {
    render(<ProfileEditor initialVersions={[]} />);
    expect(screen.getAllByLabelText("Subtype name")).toHaveLength(4);
    expect(screen.getByLabelText("Contact")).toHaveValue(
      "meteorology@gaa.gd; 1-473-444-4142"
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add assessment rule" })[0]
    );
    fireEvent.change(screen.getByLabelText("Metric or observed condition"), {
      target: { value: "Rainfall accumulation" },
    });
    expect(screen.getByLabelText("Threshold")).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      base_version: 0,
      definition: {
        channels: [],
        issuing_authority: "",
        subtypes: [
          {
            name: "Heavy Rainfall",
            rules: [
              {
                metric: "Rainfall accumulation",
                threshold: null,
                level: "Warning",
              },
            ],
          },
          { name: "Flash Flood" },
          { name: "River Flood" },
          { name: "Urban Flood" },
        ],
      },
    });
    expect(
      await screen.findByText("Saved draft version 1.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve saved version" })
    ).toBeDisabled();
  });

  it("creates a draft revision when editing an approved profile without changing its snapshot", async () => {
    const original = version("APPROVED");
    render(<ProfileEditor initialVersions={[original]} />);
    fireEvent.change(screen.getByLabelText("Profile name"), {
      target: { value: "Revised flood guidance" },
    });
    expect(
      screen.queryByRole("button", { name: "Create alert draft" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await screen.findByText("Saved draft version 2.");
    expect(body).toMatchObject({
      base_version: 1,
      definition: { name: "Revised flood guidance" },
    });
    expect(original.definition.name).toBe("Flood / Heavy Rain");
    expect(original.state).toBe("APPROVED");
  });

  it("preserves unsaved edits if a concurrent version conflicts", async () => {
    server.use(
      http.post(`${BASE}/flood-heavy-rain/versions`, () =>
        HttpResponse.json({ detail: "Reload" }, { status: 409 })
      )
    );
    render(<ProfileEditor initialVersions={[]} />);
    fireEvent.change(screen.getByLabelText("Profile name"), {
      target: { value: "My draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await screen.findByRole("status");
    expect(screen.getByLabelText("Profile name")).toHaveValue("My draft");
    expect(screen.getByRole("button", { name: SAVE })).toBeEnabled();
  });
});
