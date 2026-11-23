import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsolePager } from "@/components/console-pager";

describe("ConsolePager", () => {
  it("links to the previous and next pages and says where it is", () => {
    render(
      <ConsolePager
        count={60}
        lastPage={3}
        nextHref="/organisations?page=3"
        page={2}
        previousHref="/organisations?page=1"
      />
    );
    expect(screen.getByText("60 total, page 2 of 3")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Go to previous page" })
        .getAttribute("href")
    ).toBe("/organisations?page=1");
    expect(
      screen.getByRole("link", { name: "Go to next page" }).getAttribute("href")
    ).toBe("/organisations?page=3");
  });

  it("keeps both controls in place and disabled on a single page", () => {
    render(
      <ConsolePager
        count={4}
        lastPage={1}
        nextHref={undefined}
        page={1}
        previousHref={undefined}
      />
    );
    expect(screen.queryByRole("link")).toBeNull();
    const previous = screen.getByRole("button", {
      name: "Go to previous page",
    });
    const next = screen.getByRole("button", { name: "Go to next page" });
    expect(previous.hasAttribute("disabled")).toBe(true);
    expect(next.hasAttribute("disabled")).toBe(true);
  });

  it("names the navigation landmark", () => {
    render(
      <ConsolePager
        count={1}
        label="Organisation pages"
        lastPage={1}
        nextHref={undefined}
        page={1}
        previousHref={undefined}
      />
    );
    expect(
      screen.getByRole("navigation", { name: "Organisation pages" })
    ).toBeTruthy();
  });
});
