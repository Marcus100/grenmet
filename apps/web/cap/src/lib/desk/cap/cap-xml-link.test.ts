import { describe, expect, it } from "vitest";
import { capXmlPath } from "./cap-xml-link";

describe("capXmlPath", () => {
  it("encodes an OID identifier as a single path segment", () => {
    expect(capXmlPath("urn:oid:2.49.0.0.308.0:test-1")).toBe(
      "/feeds/alerts/urn%3Aoid%3A2.49.0.0.308.0%3Atest-1.xml"
    );
  });

  it("cannot be turned into another path by its identifier", () => {
    const path = capXmlPath("../../desk/settings");
    expect(path.startsWith("/feeds/alerts/")).toBe(true);
    expect(path).not.toContain("/desk/");
    expect(path.split("/")).toHaveLength(4);
  });
});
