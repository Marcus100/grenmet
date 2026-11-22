import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { NoAccessNotice } from "@/components/no-access-notice";

const ASK_OWNER = /Ask an owner or admin of your organisation/u;
const SIGN_ON = /Single sign-on/u;

it("says who to ask and links to the Access page", () => {
  render(<NoAccessNotice />);
  const notice = screen.getByRole("region", {
    name: "You do not have access yet",
  });
  expect(within(notice).getByText(ASK_OWNER)).toBeInTheDocument();
  expect(
    within(notice).getByRole("link", { name: "Access page" })
  ).toHaveAttribute("href", "/access");
  expect(screen.queryByText(SIGN_ON)).toBeNull();
});
