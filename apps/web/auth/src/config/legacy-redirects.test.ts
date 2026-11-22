import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("legacy sign-up paths", () => {
  it("sends /sign-up and /register to /signup as temporary redirects", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual([
      { source: "/sign-up", destination: "/signup", permanent: false },
      { source: "/register", destination: "/signup", permanent: false },
    ]);
  });
});
