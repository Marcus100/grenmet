import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApproveForm, RejectForm } from "@/components/moderation-decision";
import {
  CaseTable,
  HistoryTimeline,
  StatusTabs,
} from "@/components/moderation-panels";

vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT")) {
      throw error;
    }
  },
}));

const row = {
  organisation_id: "org_1",
  organiser_id: "0b8f6f0e-6a53-4a0e-9a9b-3f1f2c5d7e11",
  organiser_slug: "acme-events",
  name: "Acme Events",
  verification_status: "pending" as const,
  requested_at: "2026-10-18T12:30:00Z",
  decided_at: null,
};

const RE_WAITING = /waiting for review/u;
const RE_0 = /rejected/u;
const RE_1 = /Staff, 2026-10-18 12:30 UTC/u;
const RE_2 = /Organiser owner/u;
const RE_3 = /can publish/u;
const RE_4 = /Note/u;
const RE_5 = /Reason sent/u;
const RE_6 = /emails the organiser/u;
const RE_7 = /two-step verification/u;
const RE_8 = /Reload the page/u;

describe("queue", () => {
  it("shows an empty state per status", () => {
    const { rerender } = render(<CaseTable rows={[]} status="pending" />);
    expect(screen.getByRole("status").textContent).toMatch(RE_WAITING);
    rerender(<CaseTable rows={[]} status="rejected" />);
    expect(screen.getByRole("status").textContent).toMatch(RE_0);
  });

  it("links each case by organisation id", () => {
    render(<CaseTable rows={[row]} status="pending" />);
    expect(
      screen.getByRole("link", { name: "Acme Events" }).getAttribute("href")
    ).toBe("/moderation/org_1");
  });

  it("marks the current tab", () => {
    render(<StatusTabs current="approved" />);
    expect(
      screen
        .getByRole("link", { name: "Approved" })
        .getAttribute("aria-current")
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Pending" }).getAttribute("aria-current")
    ).toBeNull();
  });
});

describe("history", () => {
  it("says so when empty", () => {
    render(<HistoryTimeline events={[]} />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows role labels and reasons, never emails", () => {
    render(
      <HistoryTimeline
        events={[
          {
            action: "reject",
            actor_name: "Staff",
            at: "2026-10-18T12:30:00Z",
            reason: "Papers missing",
          },
          {
            action: "resubmit",
            actor_name: "Organiser owner",
            at: "2026-10-19T09:00:00Z",
          },
        ]}
      />
    );
    expect(screen.getByText("Rejected")).toBeTruthy();
    expect(screen.getByText(RE_1)).toBeTruthy();
    expect(screen.getByText("Papers missing")).toBeTruthy();
    expect(screen.getByText(RE_2)).toBeTruthy();
  });
});

describe("decision forms", () => {
  it("explains approval and lets the note stay empty", () => {
    render(
      <ApproveForm action={() => Promise.resolve({})} organisationId="org_1" />
    );
    expect(screen.getByText(RE_3)).toBeTruthy();
    expect((screen.getByLabelText(RE_4) as HTMLInputElement).required).toBe(
      false
    );
  });

  it("requires a reason on rejection, explains the email and counts characters", () => {
    render(
      <RejectForm action={() => Promise.resolve({})} organisationId="org_1" />
    );
    const reason = screen.getByLabelText(RE_5) as HTMLTextAreaElement;
    expect(reason.required).toBe(true);
    expect(reason.maxLength).toBe(500);
    expect(screen.getByText(RE_6)).toBeTruthy();
    fireEvent.change(reason, { target: { value: "Papers missing" } });
    expect(screen.getByText("14")).toBeTruthy();
  });

  it("shows an alert with the API refusal", async () => {
    render(
      <ApproveForm
        action={() => Promise.resolve({ code: "mfa" })}
        organisationId="org_1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(RE_7);
  });

  it("gives reload guidance when the action throws", async () => {
    render(
      <RejectForm
        action={() => Promise.reject(new Error("network"))}
        organisationId="org_1"
      />
    );
    fireEvent.change(screen.getByLabelText(RE_5), {
      target: { value: "Papers missing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(RE_8);
  });

  it("regression: the typed reason survives a refused rejection", async () => {
    render(
      <RejectForm
        action={(_previous, data) =>
          Promise.resolve({ code: "mfa", reason: String(data.get("reason")) })
        }
        organisationId="org_1"
      />
    );
    fireEvent.change(screen.getByLabelText(RE_5), {
      target: { value: "Papers missing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText(RE_5) as HTMLTextAreaElement).value).toBe(
      "Papers missing"
    );
  });

  it("keeps the typed reason when the action throws (fails without the guard fix)", async () => {
    render(
      <RejectForm
        action={() => Promise.reject(new Error("network"))}
        organisationId="org_1"
      />
    );
    fireEvent.change(screen.getByLabelText(RE_5), {
      target: { value: "Papers missing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText(RE_5) as HTMLTextAreaElement).value).toBe(
      "Papers missing"
    );
  });

  it("regression: the typed note survives a refused approval", async () => {
    render(
      <ApproveForm
        action={(_previous, data) =>
          Promise.resolve({ code: "mfa", reason: String(data.get("reason")) })
        }
        organisationId="org_1"
      />
    );
    fireEvent.change(screen.getByLabelText(RE_4), {
      target: { value: "Checked ID" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText(RE_4) as HTMLInputElement).value).toBe(
      "Checked ID"
    );
  });
});
