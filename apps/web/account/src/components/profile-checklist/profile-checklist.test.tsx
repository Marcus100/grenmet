import type { AccountProfilePublic } from "@barrelsgd/api-client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileChecklist } from "./profile-checklist";

const NAMELESS: AccountProfilePublic = {
  email: "kezia@example.com",
  first_name: "kezia",
  last_name: "",
  name_is_placeholder: true,
  phone: null,
};
const NAMED: AccountProfilePublic = {
  ...NAMELESS,
  first_name: "Kezia",
  last_name: "Mitchell",
  name_is_placeholder: false,
};

const VERIFY_WORD = /verif/iu;
const ALL_DONE = /^4 of 4 done/u;

afterEach(cleanup);

function rows(): HTMLElement[] {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

function row(index: number): HTMLElement {
  const found = rows()[index];
  if (!found) throw new Error(`row ${index} missing`);
  return found;
}

describe("ProfileChecklist", () => {
  it("shows only the email as done after a quick sign-up", () => {
    render(<ProfileChecklist hasPhoto={false} profile={NAMELESS} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Finish your profile" })
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 4 done")).toBeInTheDocument();
    expect(rows()).toHaveLength(4);

    expect(row(0)).toHaveTextContent("Email (done)");
    expect(row(0)).toHaveTextContent("kezia@example.com");
    expect(within(row(0)).queryByRole("link")).toBeNull();

    // The made-up name is not shown back as the person's name.
    expect(row(1)).toHaveTextContent("Your name (to do)");
    expect(
      within(row(1)).getByRole("link", { name: "Add your name" })
    ).toHaveAttribute("href", "/profile/name");
    expect(row(2)).toHaveTextContent("Phone number (to do)");
    expect(
      within(row(2)).getByRole("link", { name: "Add a phone number" })
    ).toHaveAttribute("href", "/profile/phone");
    expect(row(3)).toHaveTextContent("Photo (to do)");
    expect(
      within(row(3)).getByRole("link", { name: "Add a photo" })
    ).toHaveAttribute("href", "#profile-photo");
  });

  it("shows the value and a change action on each finished row", () => {
    render(
      <ProfileChecklist
        hasPhoto={false}
        profile={{ ...NAMED, phone: "+14734401234" }}
      />
    );

    expect(screen.getByText("3 of 4 done")).toBeInTheDocument();
    expect(row(1)).toHaveTextContent("Your name (done)");
    expect(row(1)).toHaveTextContent("Kezia Mitchell");
    expect(
      within(row(1)).getByRole("link", { name: "Edit name" })
    ).toHaveAttribute("href", "/profile/name");
    expect(row(2)).toHaveTextContent("+14734401234");
    expect(
      within(row(2)).getByRole("link", { name: "Change phone number" })
    ).toHaveAttribute("href", "/profile/phone");
    expect(row(3)).toHaveTextContent("Photo (to do)");
    // Nothing is said about verifying the number.
    expect(screen.queryByText(VERIFY_WORD)).toBeNull();
  });

  it("stays on the page and says the profile is complete", () => {
    render(
      <ProfileChecklist
        hasPhoto
        profile={{ ...NAMED, phone: "+14734401234" }}
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Profile complete" })
    ).toBeInTheDocument();
    expect(screen.getByText(ALL_DONE)).toBeInTheDocument();
    expect(rows()).toHaveLength(4);
    expect(
      within(row(3)).getByRole("link", { name: "Change photo" })
    ).toHaveAttribute("href", "#profile-photo");
  });

  it("does not count a photo that could not be checked", () => {
    render(<ProfileChecklist hasPhoto={null} profile={NAMED} />);

    expect(screen.getByText("2 of 4 done")).toBeInTheDocument();
    expect(row(3)).toHaveTextContent("We could not check your photo just now.");
  });

  it("gives every action a 44 px target and a visible focus ring", () => {
    render(<ProfileChecklist hasPhoto={false} profile={NAMELESS} />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("focus-visible:ring-2");
    }
  });
});
