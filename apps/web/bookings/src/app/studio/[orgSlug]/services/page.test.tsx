import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import ServicesRedirectPage from "./page";

const params = (orgSlug: string) => ({ params: Promise.resolve({ orgSlug }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/studio/[orgSlug]/services", () => {
  it("opens the services section of Settings", async () => {
    await expect(
      ServicesRedirectPage(params("babydoll"))
    ).rejects.toHaveProperty(
      "message",
      "NEXT_REDIRECT /studio/babydoll/settings#services-heading"
    );
  });

  it("is not found for a slug that cannot be a studio address", async () => {
    await expect(ServicesRedirectPage(params("A B"))).rejects.toHaveProperty(
      "message",
      "NEXT_NOT_FOUND"
    );
  });
});
