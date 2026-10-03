import { describe, expect, it } from "vitest";
import type { PublishedQuestion } from "@/lib/cms";
import { groupByTopic } from "@/lib/questions";

const q = (id: string, topics: string[]) =>
  ({ id, topics, question: id }) as unknown as PublishedQuestion;

describe("groupByTopic", () => {
  it("groups by first known topic in CMS order, unknown last", () => {
    const groups = groupByTopic([
      q("a", ["rain"]),
      q("b", ["tropical", "rain"]),
      q("c", []),
      q("d", ["nonsense", "safety"]),
    ]);
    expect(
      groups.map(([topic, items]) => [topic, items.map((i) => i.id)])
    ).toEqual([
      ["tropical", ["b"]],
      ["rain", ["a"]],
      ["safety", ["d"]],
      ["other", ["c"]],
    ]);
  });
});
