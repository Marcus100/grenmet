import type { ProductField, ProductKind } from "@barrelsgd/gms/products";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "@barrelsgd/ui/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { ReactNode } from "react";
import { ProductNumberInput } from "@/components/wxproducts/product-number-input";
import {
  productFieldCaption,
  productFieldLabel,
  productFieldUnit,
} from "@/lib/wxproducts/units";

const DAY_SECTION_PREFIX = /^Day (\d)/;
const SUN_TIME_KEY = /(?:sunrise|sunset)$/i;
const WEATHER_TYPE_KEY = /^(day\d)?[Ww]eatherType$/;
/** Size inputs to the data they hold; only free prose spans the card. */
function fieldWidth(f: ProductField) {
  if (f.key === "definition") return "w-full max-w-sm";
  // "Moderate or heavy showers" is the longest weather type.
  if (WEATHER_TYPE_KEY.test(f.key)) return "w-60";
  if (f.type === "textarea") return "col-span-full basis-full";
  if (sectionParts(f.section).group === "Tides") {
    if (f.options) return "w-32";
    return f.type === "time" ? "w-40" : "w-36";
  }
  if (sectionParts(f.section).group === "Wind") {
    if (f.type === "number") return "w-24";
    return f.key.endsWith("To") ? "w-22" : "w-28";
  }
  if (SUN_TIME_KEY.test(f.key)) return "w-32 min-w-0 max-w-40";
  if (f.key === "word") return "w-48";
  if (["Max temp", "Min temp"].includes(productFieldCaption(f))) return "w-36";
  if (productFieldCaption(f) === "Rain chance") return "w-40";
  if (["Min waves", "Max waves"].includes(productFieldCaption(f)))
    return "w-40";
  if (productFieldCaption(f) === "Period") return "w-28";
  if (productFieldCaption(f) === "Swell") return "w-32";
  if (f.type === "number") return "w-40";
  if (f.type === "time") return "w-44";
  if (f.type === "date") return "w-40";
  if (f.type === "datetime-local") return "w-52";
  if (f.options) {
    if (sectionParts(f.section).group === "Weather") return "w-44";
    const longest = Math.max(...f.options.map((o) => o.length));
    if (longest <= 8) return "w-40";
    return longest <= 16 ? "w-52" : "w-64";
  }
  return "w-full max-w-sm";
}
const ROW_START =
  /^(day\d)?(maxTemperature|minTemperature|Max|Min|swellDir|SwellDir)$/;
const ROW_FOLLOWER = /^(day\d)?(minTemperature|Min)$/;
/**
 * Fields that begin their own row in a section: the temperatures (maximum and
 * minimum together) and swell direction. A minimum right after its maximum
 * stays on the maximum's row.
 */
export function startsRow(f: ProductField, previous?: ProductField) {
  if (!ROW_START.test(f.key)) return false;
  return !(
    ROW_FOLLOWER.test(f.key) &&
    previous &&
    ROW_START.test(previous.key) &&
    !ROW_FOLLOWER.test(previous.key)
  );
}

/** "Day 2 · Wind" → group "Wind", key prefix "day2"; "Wind" → "Wind", "". */
export function sectionParts(section: string) {
  const day = DAY_SECTION_PREFIX.exec(section)?.[1];
  return {
    group: section.split(" · ").at(-1) ?? section,
    prefix: day ? `day${day}` : "",
  };
}

/** One labelled entry cell of a product form: select, textarea, number or input. */
export function ProductFieldControl({
  field: f,
  kind,
  onChange,
  value,
}: {
  field: ProductField;
  kind: ProductKind;
  onChange: (value: string) => void;
  value: string;
}) {
  const inputId = `${kind}-${f.key}`;
  const accessibleLabel = `${productFieldLabel(f)}${f.required ? " *" : ""}`;
  const showCaption =
    Boolean(value?.trim()) ||
    ["date", "time", "datetime-local"].includes(f.type ?? "");
  let control: ReactNode;
  if (f.options) {
    control = (
      <Select onValueChange={(next) => onChange(next ?? "")} value={value}>
        <SelectTrigger
          aria-label={accessibleLabel}
          className={cn(
            "min-w-0 flex-1 rounded-none border-0 bg-transparent pl-1.5 focus-visible:ring-0 dark:bg-transparent",
            showCaption && "pt-3 pb-0 leading-4"
          )}
          data-slot="input-group-control"
          id={inputId}
          title={productFieldLabel(f)}
        >
          <SelectValue placeholder={productFieldCaption(f)} />
        </SelectTrigger>
        <SelectContent>
          {f.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (f.type === "textarea") {
    control = (
      <InputGroupTextarea
        aria-label={accessibleLabel}
        className={cn("min-h-16", showCaption && "pt-5")}
        id={inputId}
        maxLength={12_000}
        onChange={(e) => onChange(e.target.value)}
        placeholder={productFieldCaption(f)}
        rows={2}
        title={productFieldLabel(f)}
        value={value ?? ""}
      />
    );
  } else if (f.type === "number") {
    control = (
      <ProductNumberInput
        field={f}
        id={inputId}
        onChange={onChange}
        value={value ?? ""}
      />
    );
  } else {
    control = (
      <InputGroupInput
        aria-label={accessibleLabel}
        className={showCaption ? "pt-3 pb-0 leading-4" : undefined}
        id={inputId}
        maxLength={12_000}
        onChange={(e) => onChange(e.target.value)}
        placeholder={productFieldCaption(f)}
        title={productFieldLabel(f)}
        type={f.type ?? "text"}
        value={value ?? ""}
      />
    );
  }
  return (
    <Field
      className={cn(
        "gap-2 [&>[data-slot=field-label]]:flex-none",
        fieldWidth(f),
        f.type === "textarea" && "items-start"
      )}
      orientation="horizontal"
    >
      <FieldLabel className="sr-only" htmlFor={inputId}>
        {productFieldLabel(f)}
        {f.required ? " *" : ""}
      </FieldLabel>
      <InputGroup className="min-w-0 flex-1">
        {showCaption ? (
          <InputGroupAddon
            align="inline-start"
            aria-hidden="true"
            className="pointer-events-none absolute top-0.5 right-2 left-2 z-10 justify-start gap-1 truncate p-0 font-normal text-xs leading-3"
          >
            {productFieldCaption(f)}
            {f.required ? <span className="text-destructive">*</span> : null}
          </InputGroupAddon>
        ) : null}
        {!showCaption && f.required ? (
          <InputGroupAddon
            align="inline-start"
            aria-hidden="true"
            className="pointer-events-none self-start text-destructive text-xs"
          >
            *
          </InputGroupAddon>
        ) : null}
        {control}
        {productFieldUnit(f) && sectionParts(f.section).group !== "Wind" ? (
          <InputGroupAddon
            align="inline-end"
            aria-hidden="true"
            className="shrink-0 text-xs"
          >
            {productFieldUnit(f)}
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </Field>
  );
}
