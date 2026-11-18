import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrintixAccessPanel } from "@/components/printix-access";

vi.mock("@/app/(console)/organisations/printix-actions", () => {
  const action = () => Promise.resolve(undefined as never);
  return { addPrintixMemberAction: action, setPrintixAccessAction: action };
});

const REASON_LABEL = /^Reason/u;
const ANN_ROW = /Ann Lee/u;
const BO_ROW = /Bo Reid/u;
const NO_ACCESS_OPTION = /No Printix access/u;

const organiser = {
  access: "organiser",
  can_sign_in: true,
  email: "ann@example.gd",
  full_access: false,
  full_name: "Ann Lee",
  membership_id: "mem_1",
  role: "member",
};
const owner = {
  access: "none",
  can_sign_in: false,
  email: "bo@example.gd",
  full_access: true,
  full_name: "Bo Reid",
  membership_id: "mem_2",
  role: "owner",
};

describe("Printix access panel", () => {
  it("shows the add form even with no members", () => {
    render(<PrintixAccessPanel count={0} organisationId="org_1" rows={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No active members.");
    expect(
      screen.getByRole("form", { name: "Add person to Printix" })
    ).toBeInTheDocument();
  });

  it("lists each member's access and sign-in state", () => {
    render(
      <PrintixAccessPanel
        count={2}
        organisationId="org_1"
        rows={[organiser, owner]}
      />
    );
    const ann = screen.getByRole("row", { name: ANN_ROW });
    expect(ann).toHaveTextContent("Organiser (events, tickets, gate QR codes)");
    expect(ann).toHaveTextContent("Can sign in");
    const bo = screen.getByRole("row", { name: BO_ROW });
    expect(bo).toHaveTextContent(
      "Full access (owner or admin), cannot sign in yet"
    );
    expect(bo).toHaveTextContent("Cannot sign in");
  });

  it("never offers none to an owner, and preselects the current access", () => {
    render(
      <PrintixAccessPanel
        count={2}
        organisationId="org_1"
        rows={[organiser, owner]}
      />
    );
    const annSelect = within(
      screen.getByRole("row", { name: ANN_ROW })
    ).getByRole("combobox");
    expect(annSelect).toHaveValue("organiser");
    expect(
      within(annSelect).getByRole("option", { name: NO_ACCESS_OPTION })
    ).toBeInTheDocument();
    const boSelect = within(
      screen.getByRole("row", { name: BO_ROW })
    ).getByRole("combobox");
    expect(
      within(boSelect).queryByRole("option", { name: NO_ACCESS_OPTION })
    ).toBeNull();
  });

  it("requires a reason of at least 10 characters in every form", () => {
    render(
      <PrintixAccessPanel count={1} organisationId="org_1" rows={[organiser]} />
    );
    const reasons = screen.getAllByLabelText(REASON_LABEL);
    expect(reasons).toHaveLength(2);
    for (const reason of reasons) {
      expect(reason).toBeRequired();
      expect(reason).toHaveAttribute("minlength", "10");
    }
  });

  it("offers only organiser and gate lead when adding", () => {
    render(<PrintixAccessPanel count={0} organisationId="org_1" rows={[]} />);
    const add = screen.getByRole("form", { name: "Add person to Printix" });
    const options = within(add).getAllByRole("option");
    expect(
      options.map((option) => (option as HTMLOptionElement).value)
    ).toEqual(["organiser", "gate_lead"]);
  });

  it("shows a notice as an alert when it is a problem", () => {
    render(
      <PrintixAccessPanel
        count={0}
        notice={{ text: "No Barrels account has that email.", tone: "problem" }}
        organisationId="org_1"
        rows={[]}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Problem: No Barrels");
  });
});
