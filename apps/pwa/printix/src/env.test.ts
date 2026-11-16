import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

describe("parseEnv API origin", () => {
  it("is empty when unset, so the scanner refuses to check tickets", () => {
    expect(parseEnv({}).VITE_API_URL).toBe("");
    expect(parseEnv({ VITE_API_URL: "  " }).VITE_API_URL).toBe("");
  });

  it("keeps the origin of an https API", () => {
    expect(
      parseEnv({ VITE_API_URL: "https://api.example.test/api/v1" }).VITE_API_URL
    ).toBe("https://api.example.test");
  });

  it("allows plain http only on this machine", () => {
    expect(
      parseEnv({ VITE_API_URL: "http://localhost:8000" }).VITE_API_URL
    ).toBe("http://localhost:8000");
    expect(
      parseEnv({ VITE_API_URL: "http://api.example.test" }).VITE_API_URL
    ).toBe("");
  });

  it("refuses a value that is not a URL", () => {
    expect(parseEnv({ VITE_API_URL: "api" }).VITE_API_URL).toBe("");
  });
});
