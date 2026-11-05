import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContactForm } from "@/components/contact-form";

// WCAG 1.4.11: the outline that identifies a form control needs 3:1 against
// the adjacent background. The values are read from the app's own stylesheet
// so the test fails when someone maps --input back to a faint hairline.
const css = readFileSync(path.join(import.meta.dirname, "globals.css"), "utf8");

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined },
}));

function rootVariable(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`, "u"));
  if (!match?.[1]) {
    throw new Error(`Missing ${name} in globals.css`);
  }
  return match[1].trim();
}

const VAR_REFERENCE = /^var\((--[a-z0-9-]+)\)$/u;
const HEX_COLOUR = /^#[0-9a-f]{6}$/iu;

function resolveHex(variable: string): string {
  const reference = variable.match(VAR_REFERENCE)?.[1];
  const value = reference ? rootVariable(reference) : variable;
  if (!HEX_COLOUR.test(value)) {
    throw new Error(`Expected a hex colour, received ${value}`);
  }
  return value;
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.039_28 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (first, second) => second - first
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

describe("mbia input contrast", () => {
  it("maps the input outline to a token that clears 3:1 on paper and mist", () => {
    const input = resolveHex(rootVariable("--input"));
    expect(input).not.toBe(resolveHex("var(--gaa-rule)"));
    expect(
      contrast(input, resolveHex("var(--gaa-paper)"))
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrast(input, resolveHex("var(--gaa-mist)"))
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps the placeholder and the focus ring at or above their thresholds", () => {
    const placeholder = resolveHex(rootVariable("--muted-foreground"));
    expect(
      contrast(placeholder, resolveHex("var(--gaa-paper)"))
    ).toBeGreaterThanOrEqual(4.5);
    const ring = resolveHex(rootVariable("--ring"));
    expect(
      contrast(ring, resolveHex("var(--gaa-paper)"))
    ).toBeGreaterThanOrEqual(3);
  });

  it("renders every contact control with the shared input outline and focus classes", () => {
    render(<ContactForm />);
    const controls = [
      screen.getByLabelText("Name"),
      screen.getByLabelText("Email"),
      screen.getByLabelText("Subject"),
      screen.getByLabelText("Message"),
    ];
    for (const control of controls) {
      expect(control.className).toContain("border-input");
      expect(control.className).toContain("focus-visible:border-ring");
      expect(control.className).toContain("focus-visible:ring-ring/50");
    }
  });
});
