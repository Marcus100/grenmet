"use client";

import type { ProductField } from "@barrelsgd/gms/products";
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
  field,
  id,
  value,
  onChange,
}: {
  field: ProductField;
  id: string;
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
      : productFieldValue(field, value);
  return (
    <InputGroupInput
      aria-label={`${productFieldLabel(field)}${field.required ? " *" : ""}`}
      className={cn(
        "tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
        value.trim() && "pt-3 pb-0 leading-4"
      )}
      id={id}
      inputMode="decimal"
      onChange={(event) => {
        const entered = event.target.value;
        const canonical = productCanonicalValue(field, entered);
        setEntry({ displayed: entered, canonical });
        onChange(canonical);
      }}
      placeholder={productFieldCaption(field)}
      step="any"
      title={productFieldLabel(field)}
      type="number"
      value={displayed}
    />
  );
}
