import { describe, expect, it } from "vitest";
import { accountAppUrlSchema } from "./account-app-url";

describe("ACCOUNT_APP_URL schema", () => {
  it("accepts an https or http address", () => {
    expect(
      accountAppUrlSchema.safeParse("https://account.barrels.gd").success
    ).toBe(true);
    expect(accountAppUrlSchema.safeParse("http://localhost:3018").success).toBe(
      true
    );
  });

  it("refuses other schemes that would be rendered as a link", () => {
    expect(accountAppUrlSchema.safeParse("javascript:alert(1)").success).toBe(
      false
    );
    expect(accountAppUrlSchema.safeParse("data:text/html,hi").success).toBe(
      false
    );
  });

  it("refuses a value that is not a URL", () => {
    expect(accountAppUrlSchema.safeParse("account.barrels.gd").success).toBe(
      false
    );
  });
});
