import type { CapProfilePublic } from "@barrelsgd/api-client";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { starterProfile } from "@/lib/desk/profile-defaults";
import { renderWithGmsCatalogue as render } from "@/test/with-gms-catalogue";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const action = vi.hoisted(() => ({
  saveHazardProfileVersionAction: vi.fn(),
}));
vi.mock("@/app/desk/profiles/actions", () => action);

import { ProfileVersionDrafter } from "./profile-editor";

const ALLOWED = { allowed: true } as const;
const BLOCKED = {
  allowed: false,
  reason:
    "You need hazard library access to draft a profile version. Ask a GMS administrator.",
} as const;
const PROFILE_KEY = "flood";
const DRAFT_BUTTON = /Draft new version/u;
const SAVE_BUTTON = "Save as new draft version";
const IMPACT_LEVEL_LABEL = /impact: what it looks like/u;
const KEY_HINT_TAKEN =
  "A profile with this key already exists. Draft a new version from it instead.";

function sourceVersion(version = 2) {
  return {
    definition: starterProfile(),
    key: PROFILE_KEY,
    version,
  };
}

function savedProfile(version: number): CapProfilePublic {
  return {
    approval_errors: [],
    approved_at: null,
    approved_by: null,
    created_at: "2026-11-05T10:00:00Z",
    created_by: "u1",
    definition: starterProfile(),
    id: "11111111-2222-4333-8444-555555555555",
    key: PROFILE_KEY,
    state: "DRAFT",
    version,
  };
}

function editor(
  overrides: Partial<Parameters<typeof ProfileVersionDrafter>[0]> = {}
) {
  return render(
    <ProfileVersionDrafter
      buttonLabel="Draft new version"
      check={ALLOWED}
      intro="Saving adds a new draft."
      source={sourceVersion()}
      takenKeys={[PROFILE_KEY]}
      {...overrides}
    />
  );
}

describe("ProfileVersionDrafter", () => {
  beforeEach(() => {
    router.refresh.mockReset();
    action.saveHazardProfileVersionAction.mockReset();
  });

  it("shows the plain reason and no button for a viewer without library access", () => {
    editor({ check: BLOCKED });
    expect(screen.getByText(BLOCKED.reason)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: DRAFT_BUTTON })).toBeNull();
  });

  it("opens on the version it starts from, with the key fixed", () => {
    editor();
    fireEvent.click(screen.getByRole("button", { name: DRAFT_BUTTON }));
    expect(screen.getByLabelText("Profile key")).toHaveValue(PROFILE_KEY);
    expect(screen.getByLabelText("Profile key")).toBeDisabled();
    expect(screen.getByLabelText("Profile name")).toHaveValue(
      "Flood / Heavy Rain"
    );
    expect(
      screen.getByText(
        "The key cannot change. It identifies this profile's versions."
      )
    ).toBeInTheDocument();
  });

  it("saves the edited copy from the base version as a new draft and says it needs approval", async () => {
    action.saveHazardProfileVersionAction.mockResolvedValue({
      ok: true,
      profile: savedProfile(3),
    });
    editor();
    fireEvent.click(screen.getByRole("button", { name: DRAFT_BUTTON }));
    fireEvent.change(screen.getByLabelText("Profile name"), {
      target: { value: "Flood (revised)" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(action.saveHazardProfileVersionAction).toHaveBeenCalledWith({
      baseVersion: 2,
      definition: expect.objectContaining({ name: "Flood (revised)" }),
      key: PROFILE_KEY,
    });
    expect(
      screen.getByText(
        "Saved as version 3. It is a draft and needs approval before any warning can use it."
      )
    ).toBeInTheDocument();
    // The editor closes once saved, so the button is back.
    expect(
      screen.getByRole("button", { name: DRAFT_BUTTON })
    ).toBeInTheDocument();
  });

  it("keeps the edits and shows the server's refusal when someone saved first", async () => {
    action.saveHazardProfileVersionAction.mockResolvedValue({
      error: {
        items: ["This profile changed. Reload before saving a new version."],
        kind: "state",
        status: 409,
        title: "The alert is no longer in a state that allows this. Reload it.",
      },
      ok: false,
    });
    editor();
    fireEvent.click(screen.getByRole("button", { name: DRAFT_BUTTON }));
    fireEvent.change(screen.getByLabelText("Profile name"), {
      target: { value: "Edited name" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));

    expect(
      await screen.findByText(
        "This profile changed. Reload before saving a new version."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Profile name")).toHaveValue("Edited name");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("closes without saving and discards nothing from the server", () => {
    editor();
    fireEvent.click(screen.getByRole("button", { name: DRAFT_BUTTON }));
    fireEvent.click(
      screen.getByRole("button", { name: "Close without saving" })
    );
    expect(screen.queryByLabelText("Profile name")).toBeNull();
    expect(action.saveHazardProfileVersionAction).not.toHaveBeenCalled();
  });

  it("starts a new profile with an editable key that must be valid", () => {
    editor({ source: null, buttonLabel: "Start a new profile" });
    fireEvent.click(
      screen.getByRole("button", { name: "Start a new profile" })
    );
    const key = screen.getByLabelText("Profile key");
    expect(key).toBeEnabled();
    const save = screen.getByRole("button", { name: SAVE_BUTTON });
    expect(save).toBeDisabled();

    fireEvent.change(key, { target: { value: "Flood Key!" } });
    expect(save).toBeDisabled();

    fireEvent.change(key, { target: { value: "flood-coast" } });
    expect(save).toBeEnabled();
    expect(action.saveHazardProfileVersionAction).not.toHaveBeenCalled();
  });

  it("blocks a new profile whose key already exists and says what to do", () => {
    editor({ source: null, buttonLabel: "Start a new profile" });
    fireEvent.click(
      screen.getByRole("button", { name: "Start a new profile" })
    );
    fireEvent.change(screen.getByLabelText("Profile key"), {
      target: { value: PROFILE_KEY },
    });
    expect(screen.getByText(KEY_HINT_TAKEN)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SAVE_BUTTON })).toBeDisabled();
  });

  it("starts a grid from the standard values and explains a colour that gets milder", () => {
    editor({ source: null, buttonLabel: "Start a new profile" });
    fireEvent.click(
      screen.getByRole("button", { name: "Start a new profile" })
    );
    fireEvent.change(screen.getByLabelText("Profile key"), {
      target: { value: "wind" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Start a grid from the standard values",
      })
    );
    const cell = screen.getByRole("combobox", {
      name: "Very low likelihood, Minimal impact",
    });
    expect(cell).toHaveValue("green");
    fireEvent.change(cell, { target: { value: "red" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Very low likelihood: red at Minimal impact is stronger than green at Minor impact."
    );
  });

  it("adds an assessment rule and starts impact levels for a subtype", () => {
    editor({ source: null, buttonLabel: "Start a new profile" });
    fireEvent.click(
      screen.getByRole("button", { name: "Start a new profile" })
    );
    fireEvent.change(screen.getByLabelText("Profile key"), {
      target: { value: "wind" },
    });
    expect(screen.getAllByLabelText("Subtype name")).toHaveLength(4);
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Add assessment rule",
      })[0] as HTMLElement
    );
    expect(screen.getByText("Rule 1")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Start impact levels and responses",
      })[0] as HTMLElement
    );
    expect(screen.getAllByLabelText(IMPACT_LEVEL_LABEL)).toHaveLength(4);
  });
});
