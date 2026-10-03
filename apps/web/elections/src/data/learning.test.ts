import { describe, expect, it } from "vitest";
import { EVIDENCE } from "@/data/evidence";
import { GUIDES, learningGuide } from "@/data/learning";
import { PAGE_LEARNING } from "@/data/page-learning";

describe("learning curriculum", () => {
  it("covers all eight agreed foundations with practice and valid evidence references", () => {
    expect(GUIDES).toHaveLength(8);
    expect(new Set(GUIDES.map((guide) => guide.slug)).size).toBe(8);
    for (const guide of GUIDES) {
      expect(guide.sections.length).toBeGreaterThanOrEqual(3);
      expect(guide.exercise.answer.length).toBeGreaterThan(30);
      expect(guide.example.title).toContain("Illustration");
      for (const section of guide.sections)
        for (const source of section.sources)
          expect(EVIDENCE[source]).toBeDefined();
      for (const next of guide.next)
        if (next.href.startsWith("/learn/"))
          expect(learningGuide(next.href.slice(7))).toBeDefined();
    }
  });
  it("connects every existing page family to a real guide", () => {
    for (const topic of Object.values(PAGE_LEARNING))
      expect(learningGuide(topic.guide)).toBeDefined();
  });
});
