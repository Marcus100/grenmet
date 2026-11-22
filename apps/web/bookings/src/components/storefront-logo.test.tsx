import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StorefrontLogo } from "./storefront-logo";

const SRC = "https://storage.example.test/booking-logo/sea-salt.png";

describe("StorefrontLogo", () => {
  it("renders an eager image with the business name as alt text", () => {
    render(<StorefrontLogo name="Sea Salt Spa" src={SRC} />);
    const logo = screen.getByRole("img", { name: "Sea Salt Spa" });
    expect(logo).toHaveAttribute("src", SRC);
    expect(logo).not.toHaveAttribute("loading", "lazy");
    expect(logo).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(logo).toHaveClass("storefront-logo");
  });

  it("removes the image when it fails to load, and keeps no broken box", () => {
    const { container } = render(
      <StorefrontLogo name="Sea Salt Spa" src={SRC} />
    );
    fireEvent.error(screen.getByRole("img", { name: "Sea Salt Spa" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
