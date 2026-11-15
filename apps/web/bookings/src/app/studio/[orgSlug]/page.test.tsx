import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import OrganisationIndexPage from "./page";

const params = (orgSlug: string) => ({ params: Promise.resolve({ orgSlug }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/studio/[orgSlug]", () => {
  it("goes to the agenda of that business", async () => {
    await expect(
      OrganisationIndexPage(params("babydoll"))
    ).rejects.toHaveProperty(
      "message",
      "NEXT_REDIRECT /studio/babydoll/agenda"
    );
  });

  it("is not found for a segment that cannot be a business address", async () => {
    await expect(
      OrganisationIndexPage(params("a?b=c#d"))
    ).rejects.toHaveProperty("message", "NEXT_NOT_FOUND");
  });
});
