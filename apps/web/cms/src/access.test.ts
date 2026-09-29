import { describe, expect, it } from "vitest";
import { canPublish, isEditor, PUBLISH_KEYS } from "./access";

describe("publishing roles", () => {
  it("requires a designated editor", () => {
    expect(isEditor(null)).toBe(false);
    expect(isEditor({ id: 1, role: "author" })).toBe(false);
    expect(isEditor({ id: 2, permissionKeys: ["cms.article.edit.all"] })).toBe(
      true
    );
  });
});

describe("section publishing", () => {
  it("grants each section only to its own key", () => {
    const deskLead = { id: 3, permissionKeys: [PUBLISH_KEYS["desk-updates"]] };
    expect(canPublish(deskLead, PUBLISH_KEYS["desk-updates"])).toBe(true);
    expect(canPublish(deskLead, PUBLISH_KEYS.stories)).toBe(false);
    expect(canPublish({ id: 4, isSuperuser: true }, PUBLISH_KEYS.stories)).toBe(
      true
    );
    expect(canPublish(null, PUBLISH_KEYS.stories)).toBe(false);
  });
});
