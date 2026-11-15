import { describe, expect, it } from "vitest";
import { readInviteToken } from "./invite-state";

const TOKEN = "AbC_123-".repeat(6);

describe("readInviteToken", () => {
  it("reads the token from the fragment", () => {
    expect(readInviteToken(`#token=${TOKEN}`)).toBe(TOKEN);
  });

  it("ignores a token in any other position", () => {
    expect(readInviteToken(`#other=1&token=${TOKEN}`)).toBe(TOKEN);
    expect(readInviteToken(`?token=${TOKEN}`)).toBeNull();
    expect(readInviteToken("")).toBeNull();
  });

  it("refuses a missing, short, long or undecodable token", () => {
    expect(readInviteToken("#token=short")).toBeNull();
    expect(readInviteToken(`#token=${"x".repeat(300)}`)).toBeNull();
    expect(readInviteToken("#token=%E0%A4%A")).toBeNull();
  });
});
