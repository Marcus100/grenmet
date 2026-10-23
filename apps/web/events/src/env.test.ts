// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

async function rejection(values: Record<string, string>) {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(loadEnv(values)).rejects.toThrow();
  const logged = JSON.stringify(log.mock.calls);
  log.mockRestore();
  return logged;
}

async function loadEnv(values: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("SKIP_ENV_VALIDATION", "false");
  vi.stubEnv("TRUSTED_WEB_SECRET", "");
  vi.stubEnv("VISITOR_IP_PROXY_HOPS", "");
  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }
  return (await import("@/env")).env;
}

describe("visitor identity env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to no secret and one proxy hop", async () => {
    const env = await loadEnv({});
    expect(env.TRUSTED_WEB_SECRET).toBeUndefined();
    expect(env.VISITOR_IP_PROXY_HOPS).toBe(1);
  });

  it("accepts a 32 character secret and hops 1 to 5", async () => {
    const secret = "s".repeat(32);
    const env = await loadEnv({
      TRUSTED_WEB_SECRET: secret,
      VISITOR_IP_PROXY_HOPS: "2",
    });
    expect(env.TRUSTED_WEB_SECRET).toBe(secret);
    expect(env.VISITOR_IP_PROXY_HOPS).toBe(2);
  });

  it("fails startup on a short secret without echoing it", async () => {
    const logged = await rejection({ TRUSTED_WEB_SECRET: "short-secret" });
    expect(logged).toContain("TRUSTED_WEB_SECRET");
  });

  it.each(["0", "6", "1.5", "two"])(
    "fails startup on hops %s",
    async (hops) => {
      const logged = await rejection({ VISITOR_IP_PROXY_HOPS: hops });
      expect(logged).toContain("VISITOR_IP_PROXY_HOPS");
    }
  );
});
