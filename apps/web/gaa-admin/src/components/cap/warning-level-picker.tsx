"use client";

import type { GmsColour } from "@barrelsgd/api-client";
import { cn } from "@barrelsgd/ui/lib/utils";
import { useId } from "react";
import {
  COLOUR_LABEL,
  COLOUR_SURFACE,
  GMS_COLOURS,
  GMS_PRODUCTS,
  type GmsProduct,
  needsColour,
  PRODUCT_LABEL,
  severityForColour,
} from "@/lib/cap-levels";

interface WarningLevelPickerProps {
  colour: GmsColour | null;
  onChange: (product: GmsProduct, colour: GmsColour | null) => void;
  product: GmsProduct | null;
}

const OPTION =
  "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md border border-gm-border px-2 py-2 text-center font-semibold text-caption leading-caption has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gm-blue";

/**
 * The two decisions the GMS impact-based forecasting guidelines keep apart:
 * the product (how close or certain) and the colour (how bad). The colour
 * sets the CAP severity, so the two can never disagree. An Outlook has no
 * colour yet, so the colour choice disappears for it.
 */
export function WarningLevelPicker({
  product,
  colour,
  onChange,
}: WarningLevelPickerProps) {
  const id = useId();
  const showColour = product !== null && needsColour(product);

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-1.5 border-none p-0">
        <legend className="mb-1.5 text-gm-text-primary text-label">
          Product *
        </legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {GMS_PRODUCTS.map((option) => (
            <label
              className={cn(
                OPTION,
                option === product
                  ? "border-gm-navy bg-gm-navy text-gm-text-inverse"
                  : "text-gm-text-secondary hover:bg-gm-surface"
              )}
              key={option}
            >
              <input
                checked={option === product}
                className="sr-only"
                name={`${id}-product`}
                onChange={() =>
                  onChange(option, needsColour(option) ? colour : null)
                }
                type="radio"
                value={option}
              />
              {PRODUCT_LABEL[option]}
            </label>
          ))}
        </div>
      </fieldset>

      {product === "Outlook" && (
        <p className="text-body-sm text-gm-text-muted">
          An Outlook is an early heads-up: no colour is assigned yet. The
          website shows it in neutral blue, never as a warning colour.
        </p>
      )}

      {showColour && (
        <fieldset className="grid gap-1.5 border-none p-0">
          <legend className="mb-1.5 text-gm-text-primary text-label">
            Colour *
          </legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {GMS_COLOURS.map((option) => {
              const selected = option === colour;
              return (
                <label
                  className={cn(
                    OPTION,
                    selected ? "border-transparent" : "text-gm-text-secondary"
                  )}
                  key={option}
                  style={selected ? COLOUR_SURFACE[option] : undefined}
                >
                  <input
                    checked={selected}
                    className="sr-only"
                    name={`${id}-colour`}
                    onChange={() => onChange(product, option)}
                    type="radio"
                    value={option}
                  />
                  <span
                    aria-hidden="true"
                    className="mr-1.5 size-2.5 shrink-0 rounded-full border border-gm-text-primary/20"
                    style={{ background: COLOUR_SURFACE[option].background }}
                  />
                  {COLOUR_LABEL[option]}
                </label>
              );
            })}
          </div>
          <p aria-live="polite" className="text-body-sm text-gm-text-muted">
            {colour
              ? `Sets CAP severity to ${severityForColour(colour)}.`
              : "Choose the impact colour from the guideline matrix."}
          </p>
        </fieldset>
      )}
    </div>
  );
}
