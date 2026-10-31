import { describe, expect, it } from "vitest";
import { BARRELS_SUPPORT_EMAIL, BARRELS_SUPPORT_HREF } from "./support";

describe("Barrels support address", () => {
  it("uses the monitored support mailbox", () => {
    expect(BARRELS_SUPPORT_EMAIL).toBe("support@barrels.gd");
    expect(BARRELS_SUPPORT_HREF).toBe("mailto:support@barrels.gd");
  });
});
