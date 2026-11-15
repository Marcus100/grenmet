import { describe, expect, it } from "vitest";
import { readPairingFragment } from "@/lib/pairing";
import { SECRET } from "@/test/fixtures";

describe("readPairingFragment", () => {
  it("reads the secret from the pairing fragment", () => {
    expect(readPairingFragment(`#pair=${SECRET}`)).toEqual({
      kind: "paired",
      secret: SECRET,
    });
  });

  it("accepts the fragment without its leading hash", () => {
    expect(readPairingFragment(`pair=${SECRET}`).kind).toBe("paired");
  });

  it("finds the pair key among other fragment keys only by its exact name", () => {
    expect(readPairingFragment(`#other=1&pair=${SECRET}`).kind).toBe("paired");
    expect(readPairingFragment(`#xpair=${SECRET}`)).toEqual({
      kind: "absent",
    });
  });

  it("reports no pairing when the fragment has none", () => {
    expect(readPairingFragment("")).toEqual({ kind: "absent" });
    expect(readPairingFragment("#")).toEqual({ kind: "absent" });
  });

  it("refuses a secret of the wrong shape without echoing it", () => {
    const result = readPairingFragment("#pair=short-secret");
    expect(result).toEqual({ kind: "invalid" });
    expect(JSON.stringify(result)).not.toContain("short-secret");
    expect(readPairingFragment("#pair=")).toEqual({ kind: "invalid" });
    expect(readPairingFragment(`#pair=${"A".repeat(129)}`).kind).toBe(
      "invalid"
    );
    expect(readPairingFragment(`#pair=${"A".repeat(42)}+`).kind).toBe(
      "invalid"
    );
  });
});
