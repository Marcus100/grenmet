"use client";

import type { ProductField, ProductKind } from "@barrelsgd/gms/products";
import {
  InputGroup,
  InputGroupAddon,
} from "@barrelsgd/ui/components/ui/input-group";
import { ProductNumberInput } from "@/components/wxproducts/product-number-input";
import { productFieldUnit } from "@/lib/wxproducts/units";

/**
 * A from–to pair of numbers on one line (significant wave height, owner
 * decision 3, #1197). Each end keeps its own field, id and inline error, so
 * FastAPI messages still link to the right input.
 */
export function ProductRangeControl({
  errors,
  kind,
  label,
  max,
  min,
  onChange,
  values,
}: {
  errors: { max?: string; min?: string };
  kind: ProductKind;
  label: string;
  max: ProductField;
  min: ProductField;
  onChange: (key: string, value: string) => void;
  values: Record<string, string | undefined>;
}) {
  const unit = productFieldUnit(min, kind);
  const id = (f: ProductField) => `${kind}-${f.key}`;
  const messages = [errors.min, errors.max].filter(Boolean);
  const describedBy = messages.length ? `${id(min)}-error` : undefined;
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">
        {label}
        {unit ? ` (${unit})` : ""}
      </legend>
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          {label}
          {min.required ? <span className="text-destructive">*</span> : null}
        </span>
        <InputGroup className="w-24">
          <ProductNumberInput
            describedBy={describedBy}
            field={min}
            id={id(min)}
            invalid={errors.min ? true : undefined}
            kind={kind}
            onChange={(value) => onChange(min.key, value)}
            value={values[min.key] ?? ""}
          />
        </InputGroup>
        <span aria-hidden="true" className="text-muted-foreground text-sm">
          –
        </span>
        <InputGroup className="w-28">
          <ProductNumberInput
            describedBy={describedBy}
            field={max}
            id={id(max)}
            invalid={errors.max ? true : undefined}
            kind={kind}
            onChange={(value) => onChange(max.key, value)}
            value={values[max.key] ?? ""}
          />
          {unit ? (
            <InputGroupAddon
              align="inline-end"
              aria-hidden="true"
              className="shrink-0 text-xs"
            >
              {unit}
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </div>
      {messages.length ? (
        <p
          className="text-destructive text-xs leading-4"
          id={`${id(min)}-error`}
        >
          {messages.join(" ")}
        </p>
      ) : null}
    </fieldset>
  );
}
