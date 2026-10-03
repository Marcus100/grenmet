// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountTabs } from "./account-tabs";

describe("AccountTabs", () => {
  it("lists the five account tabs in order", () => {
    render(<AccountTabs current="/" />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["Profile", "Password", "Security", "Sessions", "Access"]
    );
  });

  it("marks only the current tab", () => {
    render(<AccountTabs current="/password" />);
    expect(screen.getByRole("link", { name: "Password" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
