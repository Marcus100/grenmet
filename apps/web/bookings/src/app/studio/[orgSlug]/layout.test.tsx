import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminShellMock, preferencesMock } from "@/test/admin-shell";
import { apiError, ORG_ID, session } from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/studio/sea-salt/agenda",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@barrelsgd/admin-kit/components/admin-shell", () => adminShellMock());
vi.mock("@barrelsgd/theme/components/preferences-provider", () =>
  preferencesMock()
);
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  getBusinessProfile: vi.fn(),
}));
vi.mock("@/lib/studio-pending", () => ({
  loadBusinessProfile: (token: string, organisationId: string) =>
    getBusinessProfile(token, organisationId),
  loadPendingRequests: vi.fn(),
}));

import { getSession } from "@/lib/session";
import { findOrganisation, getBusinessProfile } from "@/lib/studio-api";
import { loadPendingRequests } from "@/lib/studio-pending";
import OrganisationLayout from "./layout";

const AGENDA_LINK = /^Agenda/u;
const params = Promise.resolve({ orgSlug: "sea-salt" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSession).mockResolvedValue(session);
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: "sea-salt",
    role: "owner",
  });
  vi.mocked(getBusinessProfile).mockResolvedValue({
    currency: "XCD",
    publicSlug: "sea-salt-spa",
    timezone: "America/Grenada",
  });
  vi.mocked(loadPendingRequests).mockResolvedValue({ total: 3 } as never);
});

describe("organisation layout", () => {
  it("draws the shell with the business, its page and the waiting count", async () => {
    render(await OrganisationLayout({ children: <p>Page</p>, params }));
    expect(screen.getAllByText("Sea Salt Spa").length).toBeGreaterThan(0);
    expect(screen.getByText("Page")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "View my page" })[0]
    ).toHaveAttribute("href", "/sea-salt-spa");
    expect(
      screen.getAllByRole("link", { name: AGENDA_LINK })[0]?.closest("li")
    ).toHaveTextContent("3");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("hides the admin links from a member", async () => {
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "member",
    });
    render(await OrganisationLayout({ children: <p>Page</p>, params }));
    expect(screen.queryByRole("link", { name: "New booking" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plan & billing" })).toBeNull();
  });

  it("keeps the shell, without a count, when the count cannot be read", async () => {
    vi.mocked(loadPendingRequests).mockRejectedValue(apiError(503));
    render(await OrganisationLayout({ children: <p>Page</p>, params }));
    expect(reportError).toHaveBeenCalledWith(expect.anything(), "studio");
    expect(
      screen.getAllByRole("link", { name: "Agenda" })[0]
    ).toBeInTheDocument();
    expect(screen.getByText("Page")).toBeInTheDocument();
  });

  it("does not redirect, and leaves the navigation out, without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    render(await OrganisationLayout({ children: <p>Page</p>, params }));
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByText("Page")).toBeInTheDocument();
  });
});
