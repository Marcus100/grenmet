import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { NoOrganisationNotice } from "@/components/no-access-notice";

const NOT_A_MEMBER = /You are not a member of an organisation yet/u;
const ENABLE = /enable the dashboard/u;
const ASK_OWNER = /Ask an owner or admin of your organisation/u;

it("says the person is not in an organisation, and who can invite them", () => {
  render(<NoOrganisationNotice />);
  expect(
    screen.getByRole("heading", {
      level: 3,
      name: "You do not have access yet",
    })
  ).toBeInTheDocument();
  expect(screen.getByText(NOT_A_MEMBER)).toBeInTheDocument();
  expect(screen.getByText(ASK_OWNER)).toBeInTheDocument();
});

it("does not offer the enable-the-dashboard request, which only fits an organisation without access", () => {
  render(<NoOrganisationNotice />);
  expect(screen.queryByText(ENABLE)).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});
