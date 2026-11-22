import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listMyOrganisations } from "@/lib/api";
import { getSession } from "@/lib/session";
import Home, { metadata } from "./page";

vi.mock("@/lib/api", () => ({ listMyOrganisations: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

const SIGNED_IN = {
  accessToken: "token",
  email: "person@example.test",
  name: "Person",
};
const ENABLE = /can ask GMS to enable the dashboard/u;
const NOT_A_MEMBER = /You are not a member of an organisation yet/u;
const NO_ACCESS = "You do not have access yet";

describe("home page metadata", () => {
  it("titles the home page once, without the layout template repeating the name", () => {
    expect(metadata.title).toEqual({ absolute: "GMS Dashboard" });
  });
});

describe("home page states", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
    vi.mocked(listMyOrganisations).mockReset();
  });

  it("signed out: offers sign-in and no access notice", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    render(await Home());
    expect(
      screen.getByRole("link", { name: "Sign in to get started" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: NO_ACCESS })).toBeNull();
  });

  it("signed in with no organisation: the no-organisation notice under Your organisations", async () => {
    vi.mocked(getSession).mockResolvedValue(SIGNED_IN);
    vi.mocked(listMyOrganisations).mockResolvedValue([]);
    render(await Home());
    expect(
      screen.getByRole("heading", { level: 2, name: "Your organisations" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: NO_ACCESS })
    ).toBeInTheDocument();
    expect(screen.getByText(NOT_A_MEMBER)).toBeInTheDocument();
    expect(screen.queryByText(ENABLE)).toBeNull();
  });

  it("signed in to an organisation without dashboard access: the request line, not the no-organisation notice", async () => {
    vi.mocked(getSession).mockResolvedValue(SIGNED_IN);
    vi.mocked(listMyOrganisations).mockResolvedValue([
      {
        id: "org-1",
        name: "Example Org",
        role: "member",
        entitled: false,
        request_status: null,
      },
    ]);
    render(await Home());
    expect(screen.getByText(ENABLE)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request access" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: NO_ACCESS })).toBeNull();
  });

  it("signed in to an entitled organisation: no request line", async () => {
    vi.mocked(getSession).mockResolvedValue(SIGNED_IN);
    vi.mocked(listMyOrganisations).mockResolvedValue([
      {
        id: "org-2",
        name: "Ready Org",
        role: "owner",
        entitled: true,
        request_status: null,
      },
    ]);
    render(await Home());
    expect(
      screen.getByRole("link", { name: "Open meteogram" })
    ).toBeInTheDocument();
    expect(screen.queryByText(ENABLE)).toBeNull();
  });
});
