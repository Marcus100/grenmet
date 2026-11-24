import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const NO_PREFERENCE = "@media (prefers-reduced-motion: no-preference) {";
const REDUCE = "@media (prefers-reduced-motion: reduce) {";
const HOVER = "@media (hover: hover) and (pointer: fine) {";
const KEYFRAMES = /@keyframes ([\w-]+) \{([\s\S]*?)\n\}/gu;
const MOVED =
  /(?:top|left|right|bottom|width|height|margin|padding|filter|box-shadow|background)\s*:/u;
const ANIMATION_USE = /\banimation(?:-name)?\s*:/u;
const TRANSITION_ALL = /transition\s*:\s*all/u;
const SCALE_ZERO = /scale\(0\)/u;
const EASE_IN = /ease-in(?!-out)/u;

const motion = css.slice(css.indexOf(NO_PREFERENCE));
const outside = css.slice(0, css.indexOf(NO_PREFERENCE));
const reduce = css.slice(css.indexOf(REDUCE));

describe("home page motion (globals.css)", () => {
  it("defines the two easing tokens once", () => {
    expect(css).toContain("--ease-out: cubic-bezier(0.23, 1, 0.32, 1);");
    expect(css).toContain("--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);");
    expect(css.match(/--ease-out:/gu)).toHaveLength(1);
  });

  it("starts every animation and view transition only inside the reduced-motion guards", () => {
    // Outside the guards there are keyframe definitions, and the two static
    // pseudo-element rules, but no rule that starts an animation or a transition.
    const outsideRules = outside.replace(KEYFRAMES, "");
    expect(ANIMATION_USE.test(outsideRules)).toBe(false);
    expect(outsideRules).not.toContain("transition:");
    expect(outsideRules).not.toContain("@view-transition");
    expect(outsideRules).not.toContain("view-transition-name");
    expect(motion).toContain("@view-transition");
    expect(motion).toContain("navigation: auto");
  });

  it("gates hover movement on a fine hover pointer", () => {
    expect(motion).toContain(HOVER);
    const hoverAt = motion.indexOf(HOVER);
    expect(motion.indexOf(":hover")).toBeGreaterThan(hoverAt);
    expect(css.match(/:hover/gu)).toHaveLength(1);
  });

  it("puts scroll-driven reveals behind a support check", () => {
    const at = motion.indexOf("@supports (animation-timeline: view())");
    expect(at).toBeGreaterThan(-1);
    expect(motion.indexOf("animation-timeline: view()")).toBeGreaterThan(at);
    expect(motion.indexOf("animation-timeline: scroll(root)")).toBeGreaterThan(
      at
    );
    expect(outside).not.toContain("animation-timeline");
  });

  it("only animates transform and opacity, and never scale(0), ease-in or transition: all", () => {
    for (const [, name, body] of css.matchAll(KEYFRAMES)) {
      expect(MOVED.test(body ?? ""), `keyframes ${name}`).toBe(false);
    }
    expect(SCALE_ZERO.test(css)).toBe(false);
    expect(EASE_IN.test(css)).toBe(false);
    expect(TRANSITION_ALL.test(css)).toBe(false);
    expect(motion).toContain("transition: transform 140ms var(--ease-out);");
  });

  it("keeps the ambience slow, linear and after the entrance", () => {
    expect(motion).toContain("drift-a 24s linear 600ms infinite alternate");
    expect(motion).toContain("drift-b 31s linear 600ms infinite alternate");
  });

  it("names the search pill and the card names only in the no-preference block", () => {
    expect(motion).toContain("view-transition-name: search;");
    expect(motion).toContain("view-transition-name: var(--vt);");
    expect(css.match(/view-transition-name:/gu)).toHaveLength(2);
  });

  it("under reduced motion keeps only a 200 ms fade for the hero and rail", () => {
    expect(reduce).toContain(".enter,");
    expect(reduce).toContain("animation: fade 200ms var(--ease-out) both;");
    expect(reduce).not.toContain("translate");
    expect(reduce).not.toContain("scale");
    expect(reduce).not.toContain("view-transition");
    expect(reduce).not.toContain("drift");
  });
});
