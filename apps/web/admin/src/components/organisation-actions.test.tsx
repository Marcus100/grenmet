import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AppEntitlements,
  OrganisationActions,
} from "@/components/organisation-actions";
import { HistoryPanel, MembersPanel } from "@/components/organisation-panels";

const REFUSED_TEXT = /refused until it is reactivated/;
const ACTOR_TEXT = /Sam Staff, 2026-10-18 12:30 UTC/;
const CHANGE_TEXT = /none -> Papers checked/;
const HIDDEN_TEXT = /hidden/;

vi.mock("@/app/(console)/organisations/actions", () => {
  const action = () => Promise.resolve(undefined as never);
  return {
    editOrganisationAction: action,
    setAppAction: action,
    setStatusAction: action,
    unverifyAction: action,
    verifyAction: action,
  };
});

const base = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  kind: "business",
  status: "active",
  verified_at: null,
  apps: [{ app_key: "events", enabled: true }],
  available_apps: [
    { key: "events", label: "Barrels Events" },
    { key: "cms", label: "Barrels CMS" },
  ],
};

describe("OrganisationActions", () => {
  it("offers verification with a required reason for an unverified organisation", () => {
    render(<OrganisationActions organisation={base} />);
    expect(
      screen.getByText("Verify organisation", { selector: "summary" })
    ).toBeTruthy();
    expect(
      screen.queryByText("Remove verification", { selector: "summary" })
    ).toBeNull();
    const reason = screen.getByLabelText("What was checked");
    expect(reason.hasAttribute("required")).toBe(true);
    expect(screen.getByText("Suspend", { selector: "summary" })).toBeTruthy();
  });

  it("offers to remove verification and reactivate when the state calls for it", () => {
    render(
      <OrganisationActions
        organisation={{
          ...base,
          status: "suspended",
          verified_at: "2026-10-01T00:00:00Z",
        }}
      />
    );
    expect(
      screen.getByText("Remove verification", { selector: "summary" })
    ).toBeTruthy();
    expect(
      screen.queryByText("Verify organisation", { selector: "summary" })
    ).toBeNull();
    expect(
      screen.getByText("Reactivate", { selector: "summary" })
    ).toBeTruthy();
    expect(screen.getByText("Confirm reactivate")).toBeTruthy();
  });

  it("states the effect of suspending before the confirm button", () => {
    render(<OrganisationActions organisation={base} />);
    expect(screen.getByText("Confirm suspend")).toBeTruthy();
    expect(screen.getByText(REFUSED_TEXT)).toBeTruthy();
  });
});

describe("AppEntitlements", () => {
  it("writes each app's state out, with Not set for unrecorded ones", () => {
    render(<AppEntitlements organisation={base} />);
    const events = screen.getByText("Barrels Events").closest("li");
    const cms = screen.getByText("Barrels CMS").closest("li");
    if (!(events && cms)) throw new Error("rows missing");
    expect(within(events).getByText("Enabled")).toBeTruthy();
    expect(
      within(events).getByRole("button", { name: "Disable" })
    ).toBeTruthy();
    expect(within(cms).getByText("Not set")).toBeTruthy();
    expect(within(cms).getByRole("button", { name: "Enable" })).toBeTruthy();
  });
});

describe("panels", () => {
  it("lists members and says so when there are none", () => {
    const { rerender } = render(
      <MembersPanel
        count={1}
        rows={[
          {
            membership_id: "mem_1",
            email: "owner@example.com",
            full_name: "Olive Owner",
            role: "owner",
          },
        ]}
      />
    );
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    rerender(<MembersPanel count={0} rows={[]} />);
    expect(screen.getByText("No active members.")).toBeTruthy();
  });

  it("renders history entries with actor, changes and masked values", () => {
    render(
      <HistoryPanel
        count={1}
        rows={[
          {
            id: "a1",
            action: "verify",
            actor_name: "Sam Staff",
            created_at: "2026-10-18T12:30:00Z",
            record_label: "Organisation",
            changes: [
              { field: "reason", old: null, new: "Papers checked" },
              { field: "secret", masked: true },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText("Organisation: verify")).toBeTruthy();
    expect(screen.getByText(ACTOR_TEXT)).toBeTruthy();
    expect(screen.getByText(CHANGE_TEXT)).toBeTruthy();
    expect(screen.getByText(HIDDEN_TEXT)).toBeTruthy();
  });

  it("says when no history exists", () => {
    render(<HistoryPanel count={0} rows={[]} />);
    expect(screen.getByText("No changes recorded yet.")).toBeTruthy();
  });
});
