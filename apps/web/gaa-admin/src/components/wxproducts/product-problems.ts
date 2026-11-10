import type { ProductField, ProductKind } from "@barrelsgd/gms/products";
import { productFieldLabel } from "@/lib/wxproducts/units";
import { sectionParts } from "./product-field-control";

/** One blocking problem in the error summary. */
export interface ProductProblem {
  /** DOM id of the control the message is about; absent when no single field matches. */
  fieldId?: string;
  message: string;
  /** Evening period prefix ("" for tonight, "day2" and so on) the field sits in. */
  period?: string;
}

const DAY_PREFIX = /^Day (\d):/u;

/**
 * Pairs each FastAPI message with the visible field whose label it names. The
 * message text is kept exactly as the API wrote it. Messages that name no field
 * (for example a whole-form rule) stay unlinked in the summary.
 */
export function productProblems(
  kind: ProductKind,
  fields: readonly ProductField[],
  messages: readonly string[]
): ProductProblem[] {
  return messages
    .filter((message) => message.trim() !== "")
    .map((message) => {
      const field = matchField(message, fields, kind);
      if (!field) return { message };
      return {
        fieldId: `${kind}-${field.key}`,
        message,
        period: sectionParts(field.section).prefix,
      };
    });
}

/** The longest label named in the message wins; "Day N:" messages only match that day's fields. */
function matchField(
  message: string,
  fields: readonly ProductField[],
  kind: ProductKind
) {
  const day = DAY_PREFIX.exec(message)?.[1];
  const period = day ? `day${day}` : "";
  let best: ProductField | undefined;
  let bestLength = 0;
  for (const field of fields) {
    if (sectionParts(field.section).prefix !== period) continue;
    for (const label of new Set([
      field.label,
      productFieldLabel(field, kind),
    ])) {
      if (label && label.length > bestLength && message.includes(label)) {
        best = field;
        bestLength = label.length;
      }
    }
  }
  return best;
}
