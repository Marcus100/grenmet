import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import NewBookingRedirectPage from "./page";

const params = (orgSlug: string) => ({ params: Promise.resolve({ orgSlug }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/studio/[orgSlug]/new", () => {
  it("goes to New booking, the page that exists", async () => {
    await expect(
      NewBookingRedirectPage(params("babydoll"))
    ).rejects.toHaveProperty(
      "message",
      "NEXT_REDIRECT /studio/babydoll/bookings/new"
    );
  });

  it("is not found for a slug that cannot be a studio address", async () => {
    await expect(NewBookingRedirectPage(params("a/b"))).rejects.toHaveProperty(
      "message",
      "NEXT_NOT_FOUND"
    );
  });
});
