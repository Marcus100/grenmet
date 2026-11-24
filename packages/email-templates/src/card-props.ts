import type { CardEmailProps } from "./card";

/**
 * Checks the untyped JSON props FastAPI sends for the `card` template
 * (`apps/api/fastapi/src/email_layout.py`, `to_props`) against the shape
 * `CardEmailProps` declares, element by element, and throws on the first
 * mismatch. Extra fields are ignored; React escapes every value and the layout
 * drops unsafe links, so this guards the shape, not the content.
 */

type Check = (value: unknown, where: string) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text: Check = (value, where) => {
  if (typeof value !== "string") {
    throw new Error(`card ${where} must be text`);
  }
};

/** A plain object whose named fields are all text. */
function textFields(fields: readonly string[]): Check {
  return (value, where) => {
    if (!isRecord(value)) {
      throw new Error(`card ${where} must be an object`);
    }
    for (const field of fields) {
      text(value[field], `${where}.${field}`);
    }
  };
}

const action = textFields(["label", "url"]);
const row = textFields(["label", "value"]);
const logo = textFields(["url", "alt"]);
const chipLabel = textFields(["label"]);

const chip: Check = (value, where) => {
  chipLabel(value, where);
  const tone = (value as Record<string, unknown>).tone;
  if (tone !== undefined && tone !== "accent" && tone !== "muted") {
    throw new Error(`card ${where}.tone must be accent or muted`);
  }
};

const money: Check = (value, where) => {
  row(value, where);
  const strong = (value as Record<string, unknown>).strong;
  if (strong !== undefined && typeof strong !== "boolean") {
    throw new Error(`card ${where}.strong must be true or false`);
  }
};

/** A list (never null) whose every element passes `check`. */
function listOf(check: Check): Check {
  return (value, where) => {
    if (!Array.isArray(value)) {
      throw new Error(`card ${where} must be a list`);
    }
    for (const [index, item] of value.entries()) {
      check(item, `${where}[${index}]`);
    }
  };
}

/** A field the layout also accepts as null. */
function nullable(check: Check): Check {
  return (value, where) => {
    if (value !== null) {
      check(value, where);
    }
  };
}

// Every optional card field and the shape it must have when present.
const OPTIONAL_FIELDS: Readonly<Record<string, Check>> = {
  accent: nullable(text),
  chip: nullable(chip),
  code: nullable(text),
  eyebrow: nullable(text),
  greeting: nullable(text),
  linkFallback: nullable(text),
  logo: nullable(logo),
  money: listOf(money),
  paragraphs: listOf(text),
  policy: listOf(text),
  preview: nullable(text),
  primary: nullable(action),
  quiet: nullable(text),
  quietLink: nullable(action),
  rows: listOf(row),
  secondary: listOf(action),
};

const REQUIRED_TEXT = ["subject", "title", "footer"] as const;

export function cardProps(props: Record<string, unknown>): CardEmailProps {
  for (const field of REQUIRED_TEXT) {
    const value = props[field];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`card requires ${REQUIRED_TEXT.join(", ")}`);
    }
  }
  for (const [field, check] of Object.entries(OPTIONAL_FIELDS)) {
    const value = props[field];
    if (value !== undefined) {
      check(value, field);
    }
  }
  return props as unknown as CardEmailProps;
}
