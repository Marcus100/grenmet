import type { PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import {
  featuredQuestionFields,
  leadStoryField,
  MAX_FEATURED_QUESTIONS,
} from "./homepage-placement";

const request = (docs: unknown[]) =>
  ({
    payload: { find: vi.fn().mockResolvedValue({ docs }) },
  }) as unknown as PayloadRequest;
const validateOf = (field: unknown) =>
  (
    field as {
      validate: (
        value: unknown,
        options: { id?: number; req: PayloadRequest }
      ) => Promise<true | string>;
    }
  ).validate;

describe("lead story", () => {
  const validate = validateOf(leadStoryField);
  it("allows unticking and the first lead", async () => {
    expect(
      await validate(false, { id: 1, req: request([{ title: "A" }]) })
    ).toBe(true);
    expect(await validate(true, { id: 1, req: request([]) })).toBe(true);
  });
  it("names the story that already leads", async () => {
    expect(
      await validate(true, { id: 2, req: request([{ title: "Rain returns" }]) })
    ).toBe('"Rain returns" already leads. Untick it first.');
  });
});

describe("featured questions", () => {
  const [featured, order] = featuredQuestionFields;
  const validate = validateOf(featured);
  it("allows up to five, then asks to untick one", async () => {
    const some = (count: number) =>
      request(Array.from({ length: count }, () => ({})));
    expect(
      await validate(true, { id: 9, req: some(MAX_FEATURED_QUESTIONS - 1) })
    ).toBe(true);
    expect(
      await validate(true, { id: 9, req: some(MAX_FEATURED_QUESTIONS) })
    ).toContain("already featured");
    expect(
      await validate(false, { id: 9, req: some(MAX_FEATURED_QUESTIONS) })
    ).toBe(true);
  });
  it("only asks for an order when featured, between 1 and five", () => {
    const field = order as unknown as {
      min: number;
      max: number;
      admin: { condition: (data: unknown, sibling: unknown) => boolean };
    };
    expect([field.min, field.max]).toEqual([1, MAX_FEATURED_QUESTIONS]);
    expect(field.admin.condition({}, { featured: true })).toBe(true);
    expect(field.admin.condition({}, { featured: false })).toBe(false);
  });
});
