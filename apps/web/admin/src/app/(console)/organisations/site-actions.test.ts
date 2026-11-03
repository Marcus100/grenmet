import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SAVED_NOTICE = /notice=secret-storage/u;

const api = vi.hoisted(() => ({
  createSite: vi.fn(),
  listOrganisationSites: vi.fn(),
  updateSite: vi.fn(),
}));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/api", () => api);
vi.mock("@/lib/report-error", () => report);
vi.mock("@/lib/staff-gate", () => ({
  requireGate: () =>
    Promise.resolve({ status: "staff", accessToken: "tok", email: "s@x.gd" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { clearSiteSecretAction, updateSiteAction } = await import(
  "./site-actions"
);

const current = {
  id: "site_1",
  organisation_id: "org_1",
  key: "barrels",
  name: "Barrels",
  site_url: null,
  contact_recipient: null,
  accepts_contact: false,
  accepts_subscriptions: false,
  turnstile_mode: "inherit",
  turnstile_site_key: null,
  turnstile_secret_set: false,
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function redirected(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
      return error.message.slice("REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("expected a redirect");
}

describe("site actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listOrganisationSites.mockResolvedValue({ data: [current], count: 1 });
  });

  it("patches only the changed fields", async () => {
    api.updateSite.mockResolvedValue(current);
    const url = await redirected(
      updateSiteAction(
        form({
          organisation_id: "org_1",
          site_id: "site_1",
          name: "Barrels Grenada",
          turnstile_mode: "inherit",
        })
      )
    );
    expect(api.updateSite).toHaveBeenCalledWith("tok", "site_1", {
      name: "Barrels Grenada",
    });
    expect(url).toContain("notice=site-updated");
  });

  it("does not call the API when nothing changed", async () => {
    const url = await redirected(
      updateSiteAction(
        form({
          organisation_id: "org_1",
          site_id: "site_1",
          name: "Barrels",
          turnstile_mode: "inherit",
        })
      )
    );
    expect(api.updateSite).not.toHaveBeenCalled();
    expect(url).toContain("notice=site-unchanged");
  });

  it("turns a 503 into the secret-storage notice without leaking the secret", async () => {
    api.updateSite.mockRejectedValue(new AuthApiError(503, "no keys"));
    const url = await redirected(
      clearSiteSecretAction(
        form({ organisation_id: "org_1", site_id: "site_1" })
      )
    );
    expect(api.updateSite).toHaveBeenCalledWith("tok", "site_1", {
      turnstile_secret: null,
    });
    expect(url).toMatch(SAVED_NOTICE);
    expect(report.reportError).toHaveBeenCalledWith(
      expect.any(AuthApiError),
      "admin-sites"
    );
  });

  it("never puts a submitted secret in the redirect", async () => {
    api.updateSite.mockRejectedValue(new AuthApiError(503, "no keys"));
    const url = await redirected(
      updateSiteAction(
        form({
          organisation_id: "org_1",
          site_id: "site_1",
          name: "Barrels",
          turnstile_mode: "inherit",
          turnstile_secret: "hunter2",
        })
      )
    );
    expect(url).not.toContain("hunter2");
    expect(url).toMatch(SAVED_NOTICE);
  });
});
