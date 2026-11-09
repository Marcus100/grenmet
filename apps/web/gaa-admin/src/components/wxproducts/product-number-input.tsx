"use client";

import type { ProductField, ProductKind } from "@barrelsgd/gms/products";
import { InputGroupInput } from "@barrelsgd/ui/components/ui/input-group";
import { cn } from "@barrelsgd/ui/lib/utils";
import { useState } from "react";
import {
  productCanonicalValue,
  productFieldCaption,
  productFieldLabel,
  productFieldValue,
} from "@/lib/wxproducts/units";

/** Preserve typed decimals and untouched canonical values while presenting preferred units. */
export function ProductNumberInput({
  describedBy,
  field,
  id,
  invalid,
  kind,
  value,
  onChange,
}: {
  describedBy?: string;
  field: ProductField;
  id: string;
  invalid?: boolean;
  /** Marine kinds are entered in knots and metres, as stored. */
  kind?: ProductKind;
  value: string;
  onChange: (value: string) => void;
}) {
  const [entry, setEntry] = useState<{
    displayed: string;
    canonical: string;
  } | null>(null);
  const displayed =
    entry?.canonical === value
      ? entry.displayed
      : productFieldValue(field, value, kind);
  return (
    <InputGroupInput
      aria-describedby={describedBy}
      aria-invalid={invalid}
      aria-label={`${productFieldLabel(field, kind)}${field.required ? " *" : ""}`}
      className={cn(
        "[appearance:textfield] tabular-nums [&::-webkit-inner-spin-button]:appearance-none",
        value.trim() && "pt-3 pb-0 leading-4"
      )}
      id={id}
      inputMode="decimal"
      onChange={(event) => {
        const entered = event.target.value;
        const canonical = productCanonicalValue(field, entered, kind);
        setEntry({ displayed: entered, canonical });
        onChange(canonical);
      }}
      placeholder={productFieldCaption(field, kind)}
      step="any"
      title={productFieldLabel(field, kind)}
      type="number"
      value={displayed}
    />
  );
}
