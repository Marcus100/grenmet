// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getPublicBusinesses } from "@/lib/public-businesses";
import BusinessError from "./[slug]/error";
import BusinessLayout from "./[slug]/layout";
import HomePage from "./page";

vi.mock("@/lib/public-businesses", () => ({ getPublicBusinesses: vi.fn() }));

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
const BUSINESS_CONTACT = /contact the business directly/u;

describe("Barrels support address on bookings pages", () => {
  it("links the platform support mailbox from the public business layout", () => {
    render(<BusinessLayout>{<p>Page body</p>}</BusinessLayout>);
    expect(screen.getByRole("link", { name: SUPPORT })).toHaveAttribute(
      "href",
      "mailto:support@barrels.gd"
    );
  });

  it("links the mailbox from the error fallback next to the business contact text", () => {
    render(<BusinessError retry={() => undefined} />);
    expect(screen.getByText(BUSINESS_CONTACT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SUPPORT })).toHaveAttribute(
      "href",
      "mailto:support@barrels.gd"
    );
  });

  it("links the mailbox from the Barrels Bookings home page", async () => {
    vi.mocked(getPublicBusinesses).mockResolvedValue({
      items: [],
      page: 1,
      has_more: false,
      categories: [],
    });
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: SUPPORT })).toHaveAttribute(
      "href",
      "mailto:support@barrels.gd"
    );
  });
});
