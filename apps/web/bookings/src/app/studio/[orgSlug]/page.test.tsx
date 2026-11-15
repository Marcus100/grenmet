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

  it("goes on for the slugs the studio actions accept", async () => {
    for (const slug of [
      "a",
      "babydoll",
      "babydoll-beauty-bar",
      "bar-2",
      "9lives",
    ]) {
      await expect(OrganisationIndexPage(params(slug))).rejects.toHaveProperty(
        "message",
        `NEXT_REDIRECT /studio/${slug}/agenda`
      );
    }
  });

  it.each([
    "a?b=c#d",
    "..",
    ".",
    "a.b",
    "a_b",
    "a~b",
    "-leading",
    "Upper",
    "a/b",
    "",
    "a".repeat(64),
  ])(
    "is not found for %j, which cannot be a business address",
    async (slug) => {
      await expect(OrganisationIndexPage(params(slug))).rejects.toHaveProperty(
        "message",
        "NEXT_NOT_FOUND"
      );
    }
  );
});
