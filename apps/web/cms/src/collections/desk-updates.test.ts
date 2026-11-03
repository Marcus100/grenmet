import type { Field } from "payload";
import { describe, expect, it } from "vitest";
import { DeskUpdates } from "./desk-updates";

type Validate = (
  value: unknown,
  options: { siblingData: { format?: string } }
) => true | string;

function field(name: string) {
  const found = DeskUpdates.fields.find(
    (item: Field) => "name" in item && item.name === name
  );
  if (!found) throw new Error(`no field ${name}`);
  return found as Field & { validate: Validate };
}

describe("desk post types (owner, 1 Nov 2026)", () => {
  it("offers standard, audio, video and chart, standard by default", () => {
    const format = field("format") as unknown as {
      defaultValue: string;
      options: { value: string }[];
    };
    expect(format.defaultValue).toBe("standard");
    expect(format.options.map((option) => option.value)).toEqual([
      "standard",
      "audio",
      "video",
      "chart",
    ]);
  });

  it("requires an allowed media link only for audio and video posts", () => {
    const { validate } = field("mediaUrl");
    expect(validate("", { siblingData: { format: "standard" } })).toBe(true);
    expect(validate("", { siblingData: { format: "video" } })).toBe(
      "Add the media link."
    );
    expect(
      validate("https://www.youtube.com/watch?v=abc", {
        siblingData: { format: "video" },
      })
    ).toBe(true);
    expect(
      validate("https://example.com/clip", { siblingData: { format: "video" } })
    ).toBe("Video links must be YouTube or Facebook.");
    expect(
      validate("https://soundcloud.com/gms/forecast", {
        siblingData: { format: "audio" },
      })
    ).toBe(true);
  });

  it("keeps the role short enough for a byline", () => {
    expect(
      (field("authorRole") as unknown as { maxLength: number }).maxLength
    ).toBe(60);
  });

  it("offers a pin switch for homepage editors, in the sidebar", () => {
    const pinned = field("pinned") as unknown as {
      type: string;
      defaultValue: boolean;
      label: string;
      admin: { position: string };
    };
    expect(pinned.type).toBe("checkbox");
    expect(pinned.defaultValue).toBe(false);
    expect(pinned.label).toBe("Pin to the top of From the Desk");
    expect(pinned.admin.position).toBe("sidebar");
  });

  it("gives each platform its own picture, with its suggested size", () => {
    const social = field("social") as unknown as {
      fields: {
        name: string;
        label?: string;
        admin?: { description?: string };
      }[];
    };
    const byName = (name: string) =>
      social.fields.find((item) => item.name === name);
    expect(byName("facebookImage")?.label).toBe("Facebook image");
    expect(byName("facebookImage")?.admin?.description).toContain("1200 x 630");
    expect(byName("instagramImage")?.admin?.description).toContain(
      "1080 x 1080 or 1080 x 1350"
    );
    expect(byName("whatsappImage")?.label).toBe("WhatsApp Channel image");
    expect(byName("image")?.label).toBe("Social image (all platforms)");
  });
});
