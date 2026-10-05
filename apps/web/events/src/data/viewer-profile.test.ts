import { describe, expect, it } from "vitest";
import type { Profile } from "@/domain/types";
import { ANONYMOUS_VIEWER_ID, isSignedIn } from "./viewer-profile";

const base: Profile = {
  bio: "",
  handle: "",
  headline: "",
  id: "alex",
  intents: [],
  interests: [],
  name: "Alex",
  parish: "st-george",
  visibility: "public",
};

describe("isSignedIn", () => {
  it("is false only for the guest stand-in", () => {
    expect(isSignedIn({ ...base, id: ANONYMOUS_VIEWER_ID })).toBe(false);
    expect(isSignedIn(base)).toBe(true);
  });
});
