import type { Field } from "payload";
import { describe, expect, it } from "vitest";
import { includeInNewsletterField, socialField } from "./common";

type Access = (args: { req: { user: unknown } }) => boolean;
const KEY = "cms.publish.stories";

const writer = {
  id: 1,
  isSuperuser: false,
  permissionKeys: ["cms.article.create"],
};
const publisher = { id: 2, isSuperuser: false, permissionKeys: [KEY] };

/** The access function a field declares for create or update. */
function accessOf(field: Field, op: "create" | "update"): Access {
  if (!("access" in field && field.access))
    throw new Error("field has no access");
  return field.access[op] as unknown as Access;
}

function socialFieldNamed(name: string): Field {
  const group = socialField(KEY);
  if (!("fields" in group)) throw new Error("social is a group");
  const found = group.fields.find(
    (item) => "name" in item && item.name === name
  );
  if (!found) throw new Error(`no ${name}`);
  return found;
}

describe("Approve for social", () => {
  it("only a publisher of the section can tick it", () => {
    const field = socialFieldNamed("approveForSocial");
    expect(accessOf(field, "update")({ req: { user: publisher } })).toBe(true);
    expect(accessOf(field, "create")({ req: { user: publisher } })).toBe(true);
    expect(accessOf(field, "update")({ req: { user: writer } })).toBe(false);
    expect(accessOf(field, "update")({ req: { user: null } })).toBe(false);
  });

  it("a publisher of a different section cannot approve this one", () => {
    const field = socialFieldNamed("approveForSocial");
    const other = { id: 3, permissionKeys: ["cms.publish.desk-updates"] };
    expect(accessOf(field, "update")({ req: { user: other } })).toBe(false);
  });
});

describe("Include in newsletter", () => {
  it("only a publisher of the section can tick it, and the superuser can", () => {
    const field = includeInNewsletterField(KEY);
    expect(accessOf(field, "update")({ req: { user: publisher } })).toBe(true);
    expect(
      accessOf(field, "update")({ req: { user: { id: 4, isSuperuser: true } } })
    ).toBe(true);
    expect(accessOf(field, "update")({ req: { user: writer } })).toBe(false);
  });
});
