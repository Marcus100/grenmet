// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BusinessError from "./[slug]/error";
import BusinessLayout from "./[slug]/layout";
import HomePage from "./page";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const SUPPORT = "support@barrels.gd";
const BUSINESS_CONTACT = /contact the business directly/;

describe("Barrels support address on bookings pages", () => {
  it("links the platform support mailbox from the public business layout", () => {
    render(<BusinessLayout>{<p>Page body</p>}</BusinessLayout>);
    expect(screen.getByRole("link", { name: SUPPORT })).toHaveAttribute(
      "href",
      "mailto:support@barrels.gd"
    );
  });

  it("links the mailbox from the error fallback next to the business contact text", () => {
    render(<BusinessError reset={() => undefined} />);
    expect(screen.getByText(BUSINESS_CONTACT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SUPPORT })).toHaveAttribute(
      "href",
      "mailto:support@barrels.gd"
    );
  });

  it("links the mailbox from the Barrels Bookings home page", () => {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: SUPPORT })).toHaveAttribute(
      "href",
      "mailto:support@barrels.gd"
    );
  });
});
