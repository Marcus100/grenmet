import type { PublicSiteAdmin } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SitesError, SitesLoading, SitesPanel } from "@/components/site-panels";

vi.mock("@/app/(console)/organisations/site-actions", () => {
  const action = () => Promise.resolve(undefined as never);
  return {
    clearSiteSecretAction: action,
    createSiteAction: action,
    updateSiteAction: action,
  };
});

const SECRET_VALUE = "super-secret-value";
const NO_SITES = /No public sites yet/;
const KEY_WARNING = /key is permanent/;

const site: PublicSiteAdmin = {
  id: "site_1",
  organisation_id: "org_1",
  key: "barrels",
  name: "Barrels Grenada",
  site_url: "https://barrels.gd",
  contact_recipient: "hello@barrels.gd",
  accepts_contact: true,
  accepts_subscriptions: false,
  turnstile_mode: "enforce",
  turnstile_site_key: "0xSITEKEY",
  turnstile_secret_set: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

describe("SitesPanel", () => {
  it("lists each site with its key, url, inbox, forms and Turnstile state", () => {
    render(<SitesPanel organisationId="org_1" sites={[site]} />);
    expect(screen.getByText("Sites (1)")).toBeTruthy();
    expect(screen.getByText("Barrels Grenada")).toBeTruthy();
    expect(screen.getByText("barrels")).toBeTruthy();
    expect(screen.getByText("https://barrels.gd")).toBeTruthy();
    expect(screen.getByText("hello@barrels.gd")).toBeTruthy();
    expect(screen.getByText("Contact")).toBeTruthy();
    expect(screen.getByText("Turnstile: enforce")).toBeTruthy();
    expect(screen.getByText("Secret set")).toBeTruthy();
  });

  it("never renders a secret, only a write-only empty field and Clear secret", () => {
    // Even if a payload carried one, the panel has no way to display it.
    const leaky = {
      ...site,
      turnstile_secret: SECRET_VALUE,
    } as PublicSiteAdmin;
    const { container } = render(
      <SitesPanel organisationId="org_1" sites={[leaky]} />
    );
    expect(container.innerHTML).not.toContain(SECRET_VALUE);
    const secret = screen.getAllByLabelText(
      "Turnstile secret (write-only)"
    )[0] as HTMLInputElement;
    expect(secret.type).toBe("password");
    expect(secret.value).toBe("");
    expect(screen.getByRole("button", { name: "Clear secret" })).toBeTruthy();
  });

  it("hides Clear secret when none is set", () => {
    render(
      <SitesPanel
        organisationId="org_1"
        sites={[{ ...site, turnstile_secret_set: false }]}
      />
    );
    expect(screen.getByText("No secret")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear secret" })).toBeNull();
  });

  it("says when there are no sites and still offers to add one", () => {
    render(<SitesPanel organisationId="org_1" sites={[]} />);
    expect(screen.getByText(NO_SITES)).toBeTruthy();
    expect(screen.getByText("Add a site")).toBeTruthy();
  });

  it("warns the key is permanent and constrains it", () => {
    render(<SitesPanel organisationId="org_1" sites={[]} />);
    expect(screen.getByText(KEY_WARNING)).toBeTruthy();
    const key = screen.getByLabelText("Key");
    expect(key.getAttribute("maxlength")).toBe("40");
    expect(key.getAttribute("pattern")).toBe("[a-z0-9]+(-[a-z0-9]+)*");
    expect(key.hasAttribute("required")).toBe(true);
  });
});

describe("loading and error states", () => {
  it("announces loading", () => {
    render(<SitesLoading />);
    expect(screen.getByText("Loading sites")).toBeTruthy();
  });

  it("shows a clear alert when sites cannot be loaded", () => {
    render(<SitesError />);
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be loaded"
    );
  });
});
