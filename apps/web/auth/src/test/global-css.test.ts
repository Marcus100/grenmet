import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.resolve(import.meta.dirname, "../app/globals.css"),
  "utf8"
);

interface StyleRule {
  // The blocks the rule sits in, outermost first, e.g. ["@layer base"].
  blocks: string[];
  selector: string;
}

// Minimal brace walker: enough to tell whether a rule is top-level (unlayered)
// or nested in a cascade layer. The stylesheet has no strings with braces.
function styleRules(source: string): StyleRule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  const stack: string[] = [];
  const rules: StyleRule[] = [];
  let prelude = "";
  for (const ch of text) {
    if (ch === "{") {
      const selector = prelude.trim();
      rules.push({ selector, blocks: [...stack] });
      stack.push(selector);
      prelude = "";
    } else if (ch === "}") {
      stack.pop();
      prelude = "";
    } else if (ch === ";") {
      prelude = "";
    } else {
      prelude += ch;
    }
  }
  return rules;
}

// Matches a selector that targets the <a> element, including inside :where() or :not().
const LINK_SELECTOR = /(^|[^\w-])a(?![\w-])/u;

describe("globals.css link colour", () => {
  // Regression: an unlayered `a { color: inherit }` beats every Tailwind colour
  // utility, so a link styled as a button lost its variant colour (1.04:1 on
  // the not-found page). Unlayered rules win over layered ones whatever their
  // specificity, so the rule must sit inside a cascade layer.
  it("keeps the bare link rule inside a cascade layer", () => {
    const linkRules = styleRules(css).filter((rule) =>
      LINK_SELECTOR.test(rule.selector)
    );

    expect(linkRules.length).toBeGreaterThan(0);
    for (const rule of linkRules) {
      expect(rule.blocks.some((block) => block.startsWith("@layer"))).toBe(
        true
      );
    }
  });
});
