import type { AuditEntryAdminPublic } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AuditChanges,
  AuditFailure,
  AuditFilterForm,
  AuditPager,
  AuditProblems,
  AuditRefusal,
  AuditTable,
} from "@/components/audit-panels";

const WAS_NOW = /was Acme, now Acme Events/u;

const entry = (
  overrides: Partial<AuditEntryAdminPublic> = {}
): AuditEntryAdminPublic => ({
  id: "7d9f2a4c-1b3e-4f5a-8c6d-9e0f1a2b3c4d",
  record_type: "platform_organisation",
  record_label: "Organisation",
  record_id: "org_1",
  action: "update",
  actor_user_id: "0b8f6f0e-6a53-4a0e-9a9b-3f1f2c5d7e11",
  actor_name: "Sam Staff",
  changes: [{ field: "name", old: "Acme", new: "Acme Events", masked: false }],
  created_at: "2026-11-22T02:30:00.123456Z",
  entity_type: "platform_organisation",
  entity_id: "org_1",
  organisation_id: "org_1",
  ...overrides,
});

describe("AuditTable", () => {
  it("renders who, what, which entity and the Grenada time with its UTC value", () => {
    render(<AuditTable entries={[entry()]} />);
    const [, row] = screen.getAllByRole("row");
    const cells = within(row as HTMLElement);
    expect(cells.getByText("Sam Staff")).toBeTruthy();
    expect(cells.getByText("update")).toBeTruthy();
    expect(cells.getAllByText("platform_organisation").length).toBeGreaterThan(
      0
    );
    expect(cells.getByText("21 Nov 2026, 22:30")).toBeTruthy();
    expect(cells.getByText("2026-11-22 02:30 UTC")).toBeTruthy();
    expect(cells.getByText("1 field changed")).toBeTruthy();
  });

  it("shows the change values as the API sent them", () => {
    render(
      <AuditChanges
        changes={[{ field: "name", old: "Acme", new: "Acme Events" }]}
      />
    );
    expect(screen.getByText("name")).toBeTruthy();
    expect(screen.getByText(WAS_NOW)).toBeTruthy();
  });

  it("never shows the values of a masked change", () => {
    // The API sends no values for a masked change; if it ever did, they stay hidden.
    const { container } = render(
      <AuditChanges
        changes={[
          {
            field: "bank_account",
            masked: true,
            old: "0123456789",
            new: "9876543210",
          },
        ]}
      />
    );
    expect(screen.getByText("Masked")).toBeTruthy();
    expect(container.textContent).not.toContain("0123456789");
    expect(container.textContent).not.toContain("9876543210");
  });

  it("says when an entry has no field changes", () => {
    render(<AuditChanges changes={[]} />);
    expect(screen.getByText("No field changes")).toBeTruthy();
  });

  it("shows a dash for an organisation the entry does not carry", () => {
    render(<AuditTable entries={[entry({ organisation_id: null })]} />);
    const [, row] = screen.getAllByRole("row");
    expect(within(row as HTMLElement).getByText("-")).toBeTruthy();
  });

  it("explains an empty result", () => {
    render(<AuditTable entries={[]} />);
    expect(screen.getByRole("status").textContent).toBe(
      "No audit entries match."
    );
  });
});

describe("AuditPager", () => {
  it("links to the newest entries and to the older page", () => {
    render(
      <AuditPager
        newestHref="/audit?action=update"
        olderHref="/audit?action=update&cursor=abc%2B%2F"
      />
    );
    expect(
      screen.getByRole("link", { name: "Newest entries" })
    ).toHaveAttribute("href", "/audit?action=update");
    expect(screen.getByRole("link", { name: "Older entries" })).toHaveAttribute(
      "href",
      "/audit?action=update&cursor=abc%2B%2F"
    );
  });

  it("renders nothing when there is only one page", () => {
    const { container } = render(
      <AuditPager newestHref={undefined} olderHref={undefined} />
    );
    expect(container.querySelector("nav")).toBeNull();
  });
});

describe("AuditFilterForm", () => {
  it("is a plain GET form that keeps what was typed", () => {
    const { container } = render(
      <AuditFilterForm
        values={{ actor_id: "not-a-uuid", from: "2026-11-01" }}
      />
    );
    const form = container.querySelector("form");
    expect(form?.getAttribute("method")).toBe("get");
    expect(screen.getByLabelText("Actor id")).toHaveValue("not-a-uuid");
    expect(screen.getByLabelText("From date (Grenada)")).toHaveValue(
      "2026-11-01"
    );
    expect(screen.getByLabelText("To date (Grenada, included)")).toHaveValue(
      ""
    );
    expect(screen.getByRole("button", { name: "Filter" })).toBeTruthy();
  });
});

describe("notice states", () => {
  it("lists every filter problem", () => {
    render(
      <AuditProblems
        problems={["The actor id must be a full user id (a UUID)."]}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "The actor id must be a full user id"
    );
  });

  it("explains a refusal without calling it a fault", () => {
    render(<AuditRefusal />);
    expect(screen.getByRole("status").textContent).toContain(
      "audit.entries.read"
    );
  });

  it("shows a plain failure as an alert", () => {
    render(<AuditFailure />);
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be loaded"
    );
  });
});
