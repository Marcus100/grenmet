import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberAddSection, MemberRowActions } from "@/components/member-admin";
import { MembersPanel } from "@/components/organisation-panels";

vi.mock("@/app/(console)/organisations/member-actions", () => {
  const action = () => Promise.resolve(undefined as never);
  return {
    addMemberAction: action,
    changeMemberRoleAction: action,
    removeMemberAction: action,
  };
});

const REASON_LABEL = /^Reason/;

const row = {
  email: "ann@example.gd",
  full_name: "Ann Lee",
  membership_id: "mem_1",
  role: "member",
};

describe("member admin controls", () => {
  it("shows the add form even for an empty roster", () => {
    render(
      <MembersPanel
        addForm={
          <MemberAddSection organisationId="org_1" selfEmail="me@b.gd" />
        }
        count={0}
        rows={[]}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("No active members.");
    expect(
      screen.getByRole("form", { name: "Add member" })
    ).toBeInTheDocument();
  });

  it("Add myself prefills the signed-in superuser", () => {
    render(<MemberAddSection organisationId="org_1" selfEmail="me@b.gd" />);
    fireEvent.click(screen.getByRole("button", { name: "Add myself" }));
    expect(screen.getByLabelText("Email or account id")).toHaveValue("me@b.gd");
  });

  it("requires a reason of at least 10 characters in every row form", () => {
    render(
      <MembersPanel
        count={1}
        rowActions={(member) => (
          <MemberRowActions member={member} organisationId="org_1" />
        )}
        rows={[row]}
      />
    );
    const reasons = screen.getAllByLabelText(REASON_LABEL);
    expect(reasons).toHaveLength(2);
    for (const reason of reasons) {
      expect(reason).toBeRequired();
      expect(reason).toHaveAttribute("minlength", "10");
    }
    expect(
      screen.getByRole("button", { name: "Remove member" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New role")).toHaveValue("member");
  });

  it("renders the member notice by the heading with the right role", () => {
    const { rerender } = render(
      <MembersPanel
        count={0}
        notice={{ text: "Member added.", tone: "ok" }}
        rows={[]}
      />
    );
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Member added.");
    rerender(
      <MembersPanel
        count={0}
        notice={{ text: "Nope.", tone: "problem", href: "https://a/security" }}
        rows={[]}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Nope.");
    expect(
      screen.getByRole("link", { name: "Open Security settings" })
    ).toHaveAttribute("href", "https://a/security");
  });

  it("submits the prefilled self email with role and organisation", () => {
    render(<MemberAddSection organisationId="org_1" selfEmail="me@b.gd" />);
    fireEvent.click(screen.getByRole("button", { name: "Add myself" }));
    const data = new FormData(
      screen.getByRole("form", { name: "Add member" }) as HTMLFormElement
    );
    expect(data.get("user")).toBe("me@b.gd");
    expect(data.get("organisation_id")).toBe("org_1");
    expect(data.get("role")).toBe("member");
  });
});
