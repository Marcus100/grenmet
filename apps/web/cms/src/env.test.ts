import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "./env";

beforeEach(() => {
  vi.stubEnv(
    "PAYLOAD_SECRET",
    "cms-test-only-secret-with-at-least-32-characters"
  );
  vi.stubEnv("DATABASE_URL", "postgresql://cms:unused@localhost:5432/gms_cms");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAILS_FROM_EMAIL", "");
  vi.stubEnv("EMAILS_FROM_NAME", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("CMS email configuration", () => {
  it("allows local development without email credentials", () => {
    expect(getEnv().RESEND_API_KEY).toBeUndefined();
  });
  it("rejects a configured key without a sender without exposing the key", () => {
    vi.stubEnv("RESEND_API_KEY", "private-test-key");
    expect(() => getEnv()).toThrow(
      "CMS EMAILS_FROM_EMAIL is required when RESEND_API_KEY is configured"
    );
  });
  it("accepts configured Resend and defaults the sender name", () => {
    vi.stubEnv("RESEND_API_KEY", "private-test-key");
    vi.stubEnv("EMAILS_FROM_EMAIL", "cms@example.test");
    const env = getEnv();
    expect(env.EMAILS_FROM_EMAIL).toBe("cms@example.test");
    expect(env.EMAILS_FROM_NAME).toBe("GMS Content");
  });
});
