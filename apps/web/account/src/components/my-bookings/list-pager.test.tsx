import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListPager } from "./list-pager";

describe("ListPager", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(
      <ListPager page={1} pageCount={1} pageParam="past_page" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers only Next on the first page, and page 1 has no parameter", () => {
    render(<ListPager page={1} pageCount={3} pageParam="past_page" />);
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/bookings?past_page=2"
    );
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("links back to the first page without a parameter", () => {
    render(<ListPager page={2} pageCount={3} pageParam="past_page" />);
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/bookings"
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/bookings?past_page=3"
    );
  });

  it("offers only Previous on the last page", () => {
    render(<ListPager page={3} pageCount={3} pageParam="past_page" />);
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/bookings?past_page=2"
    );
  });

  it("keeps the other section's parameter in every link", () => {
    render(
      <ListPager
        keep={{ upcoming_page: "4" }}
        page={2}
        pageCount={3}
        pageParam="past_page"
      />
    );
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/bookings?upcoming_page=4"
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/bookings?upcoming_page=4&past_page=3"
    );
  });
});
