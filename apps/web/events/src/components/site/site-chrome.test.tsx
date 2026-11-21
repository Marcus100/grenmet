import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/domain/types";
import { SiteHeader } from "./site-chrome";

// Renders next/link as a plain anchor tagged with a marker, so a test can tell
// a client-routed link from a full-page one.
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: { children: React.ReactNode } & React.ComponentProps<"a">) => (
    <a data-next-link="" {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("./nav-link", () => ({
  BottomNav: () => null,
  HeaderNav: () => null,
  MobileNav: () => null,
}));
vi.mock("@barrelsgd/ui/components/posthog-provider", () => ({
  CookieSettingsButton: () => null,
}));
vi.mock("@/components/community/person-avatar", () => ({
  PersonAvatar: () => null,
}));

const GUEST: Profile = {
  id: "anonymous",
  handle: "",
  name: "Guest",
  headline: "",
  bio: "",
  parish: "st-george",
  interests: [],
  intents: [],
  visibility: "public",
};

describe("events site header", () => {
  it("sends signed-out visitors to sign-in with a full-page link", () => {
    render(<SiteHeader viewer={GUEST} />);

    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe("/sign-in");
    // A client-routed link would fetch /sign-in as RSC, and that redirect
    // crosses to the account host, which fails connect-src.
    expect(signIn.hasAttribute("data-next-link")).toBe(false);
  });

  it("does not offer sign-in to a signed-in member", () => {
    render(<SiteHeader viewer={{ ...GUEST, id: "member-1", name: "Ann" }} />);

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
