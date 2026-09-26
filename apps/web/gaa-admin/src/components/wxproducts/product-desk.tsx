"use client";

import { useSessionUser } from "@barrelsgd/auth";
import { ProductContentView } from "@barrelsgd/gms/components/product-content";
import {
  capInsertTargets,
  emptyProduct,
  grenadaDate,
  ISSUE_TIMES,
  isBulletin,
  isComposedForecastField,
  isForecastKind,
  type ProductField,
  type ProductKind,
  type ProductValues,
  parameterKey,
  productFields,
  productTitle,
  type StoredProduct,
  TIDE_SLOTS,
} from "@barrelsgd/gms/products";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Card } from "@barrelsgd/ui/components/ui/card";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@barrelsgd/ui/components/ui/tabs";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { format, isValid, parseISO } from "date-fns";
import { Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import {
  loadProductHistoryAction,
  loadProductsAction,
  previewProductAction,
  saveProductAction,
} from "@/app/(admin)/wxproducts/product-actions";
import { ProductPdfPreview } from "@/components/wxproducts/product-pdf-preview";
import { bulletinExample } from "@/lib/wxproducts/bulletin-examples";
import { feetHint, nauticalMilesHint, windHint } from "@/lib/wxproducts/units";
import { visibleProductFields } from "@/lib/wxproducts/visible-fields";

import { CapForecastPicker } from "./cap-forecast-picker";
import { ProductList } from "./product-list";

const DAY_SECTION_PREFIX = /^Day (\d)/;
const DAY_KEY_PREFIX = /^(day[1-4])/;

interface HistoryItem {
  action: string;
  actorName: string;
  changeSummary: string;
  createdAt: string;
  revision: number;
}
const EVENING_DAY_DATE = /^day[1-4]Date$/;
const COMPUTED_FORECAST_FIELDS = [
  "issuedAt",
  "validFrom",
  "validTo",
  "validity",
  "area",
  "forecaster",
  "advisories",
];
const FORECAST_AREA = "Grenada, Carriacou and Petite Martinique";
/** Forecasts always cover the whole state and are issued by the signed-in forecaster; FastAPI enforces the same on save. */
function withIssuer(
  kind: ProductKind,
  values: ProductValues,
  forecaster: string
): ProductValues {
  if (!isForecastKind(kind)) return { ...values, forecaster };
  return { ...values, area: FORECAST_AREA, forecaster };
}
const DAY_SECTION = /^Day (\d)$/;
/** Size inputs to the data they hold; only free prose spans the card. */
function fieldWidth(f: ProductField) {
  if (f.type === "textarea") return "basis-full";
  if (f.type === "number") return "w-28";
  if (f.type === "time") return "w-32";
  if (f.type === "date") return "w-40";
  if (f.type === "datetime-local") return "w-52";
  if (f.options) {
    const longest = Math.max(...f.options.map((o) => o.length));
    if (longest <= 8) return "w-32";
    return longest <= 16 ? "w-44" : "w-60";
  }
  return "w-full max-w-sm";
}
/** "Day 2 · Wind" → group "Wind", key prefix "day2"; "Wind" → "Wind", "". */
function sectionParts(section: string) {
  const day = DAY_SECTION_PREFIX.exec(section)?.[1];
  return {
    group: section.split(" · ").at(-1) ?? section,
    prefix: day ? `day${day}` : "",
  };
}
const LEGACY_BY_GROUP: Record<string, string[]> = {
  Wind: ["wind"],
  Marine: ["seaState"],
  Tides: ["highTides", "lowTides"],
  Visibility: ["visibility"],
};
const STRUCTURED_BY_GROUP: Record<string, string[]> = {
  Wind: ["windDirFrom", "windSpeedMin"],
  Marine: ["seaStateFrom", "waveHeightMin"],
  Tides: TIDE_SLOTS.map((n) => `tide${n}Time`),
  Visibility: ["visibilityMin"],
};
/** Older products stored these as free text; show it until re-entered. */
function legacyNote(section: string, values: ProductValues) {
  const { group, prefix } = sectionParts(section);
  const legacy = LEGACY_BY_GROUP[group];
  const structured = STRUCTURED_BY_GROUP[group];
  if (!(legacy && structured)) return null;
  if (structured.some((name) => values[parameterKey(prefix, name)]))
    return null;
  const text = legacy
    .map((name) => values[parameterKey(prefix, name)])
    .filter(Boolean)
    .join(" · ");
  return text ? (
    <p className="text-muted-foreground text-xs">Previous format: {text}</p>
  ) : null;
}
const PERIOD_PREFIXES = ["", "day1", "day2", "day3", "day4"];
/** Forecast issue/validity and evening day dates come from the schedule, not the forecaster. */
function isComputedField(kind: ProductKind, key: string) {
  if (key === "forecaster") return true;
  if (isComposedForecastField(key) && composedFrom(kind, key)) return true;
  return (
    isForecastKind(kind) &&
    (COMPUTED_FORECAST_FIELDS.includes(key) || EVENING_DAY_DATE.test(key))
  );
}
/** Structured field each composed text key is built from (e.g. `wind` ← `windDirFrom`). */
const COMPOSED_SOURCE: Record<string, string> = {
  wind: "windDirFrom",
  seaState: "seaStateFrom",
  swell: "swellDir",
  visibility: "visibilityMin",
  highTides: "tide1Time",
  lowTides: "tide1Time",
};
/** Only hide text FastAPI composes for this kind; a cyclone's `wind` is free text. */
function composedFrom(kind: ProductKind, key: string) {
  const day = DAY_KEY_PREFIX.exec(key)?.[1] ?? "";
  const name = day
    ? key[day.length].toLowerCase() + key.slice(day.length + 1)
    : key;
  const source = COMPOSED_SOURCE[name];
  return (
    source !== undefined &&
    productFields(kind).some((f) => f.key === parameterKey(day, source))
  );
}
/** Formats scheduled dates for the read-only issue summary. */
export function formatComputedValue(value: string, type?: string) {
  if (type !== "date" && type !== "datetime-local") return value;
  const parsed = parseISO(value);
  if (!(value && isValid(parsed))) return value;
  return format(parsed, type === "date" ? "d MMM yyyy" : "d MMM yyyy, HH:mm");
}
function ProductEditor({
  kind,
  initial,
  issueDate,
  issueTime,
  onSaved,
  onDirty,
  onBusy,
  disabled,
  controls,
}: {
  controls: ReactNode;
  kind: ProductKind;
  initial: StoredProduct | null;
  issueDate: string;
  issueTime: string;
  onSaved: (product: StoredProduct) => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [publishedRevision, setPublishedRevision] = useState(
    initial?.publishedRevision ?? null
  );
  const sessionUser = useSessionUser();
  const [start] = useState(() =>
    withIssuer(
      kind,
      initial?.values ?? emptyProduct(kind, issueDate, issueTime),
      sessionUser.full_name ?? sessionUser.email
    )
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(start));
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [preview, setPreview] = useState<ProductValues | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [changeSummary, setChangeSummary] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pending, startTransition] = useTransition();
  const [defaultValues, setDefaultValues] = useState(start);
  const [tideRows, setTideRows] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      PERIOD_PREFIXES.map((prefix) => [
        prefix,
        Math.max(
          1,
          ...TIDE_SLOTS.filter(
            (n) =>
              start[parameterKey(prefix, `tide${n}Time`)] ||
              start[parameterKey(prefix, `tide${n}Type`)]
          )
        ),
      ])
    )
  );
  const form = useForm({ defaultValues });
  function replaceValues(values: ProductValues) {
    setDefaultValues(values);
    form.reset(values);
  }
  const fields = visibleProductFields(kind).filter(
    (f) => !isComputedField(kind, f.key)
  );
  const sections = [...new Set(fields.map((f) => f.section))];
  async function save(
    values: ProductValues,
    action: "draft" | "publish" | "withdraw"
  ) {
    const result = await saveProductAction({
      id,
      expectedRevision: revision,
      kind,
      values,
      action,
      changeSummary,
      reviewed,
    });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setRevision(result.product.revision);
    setPublishedRevision(result.product.publishedRevision);
    setBaseline(JSON.stringify(result.product.values));
    replaceValues(result.product.values);
    setPreview(null);
    setReviewed(false);
    setChangeSummary("");
    setHistory([]);
    onDirty(false);
    onSaved(result.product);
    const messageByAction = {
      draft: "Draft saved.",
      publish:
        "Published. GMS will show this product during its validity period.",
      withdraw: "Withdrawn from the public website.",
    } as const;
    setMessage(messageByAction[action]);
  }
  function submit(
    values: ProductValues,
    action: "draft" | "publish" | "withdraw"
  ) {
    onBusy(true);
    startTransition(async () => {
      try {
        await save(values, action);
      } finally {
        onBusy(false);
      }
    });
  }
  function review(values: ProductValues) {
    setPreview(null);
    setReviewed(false);
    onBusy(true);
    const submitted = JSON.stringify(values);
    startTransition(async () => {
      try {
        const result = await previewProductAction({
          kind,
          values,
          expectedRevision: revision,
          changeSummary,
        });
        if (JSON.stringify(form.state.values) !== submitted) return;
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        if (result.preview.errors.length) {
          setMessage(result.preview.errors.join("\n"));
          return;
        }
        replaceValues(result.preview.values);
        setMessage("");
        setPreview(result.preview.values);
      } finally {
        onBusy(false);
      }
    });
  }
  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => {
        const dirty = JSON.stringify(values) !== baseline;
        const previewCurrent =
          preview !== null &&
          JSON.stringify(preview) === JSON.stringify(values);
        const renderField = (f: ProductField) => (
          <form.Field key={f.key} name={f.key}>
            {(input) => {
              const inputId = `${kind}-${f.key}`;
              let control: ReactNode;
              if (f.options) {
                control = (
                  <Select
                    onValueChange={(value) => input.handleChange(value ?? "")}
                    value={input.state.value}
                  >
                    <SelectTrigger className="w-full" id={inputId}>
                      <SelectValue placeholder="Select…" />
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
                  <Textarea
                    id={inputId}
                    maxLength={12_000}
                    onChange={(e) => input.handleChange(e.target.value)}
                    rows={4}
                    value={input.state.value ?? ""}
                  />
                );
              } else {
                control = (
                  <Input
                    id={inputId}
                    maxLength={12_000}
                    onChange={(e) => input.handleChange(e.target.value)}
                    step={f.type === "number" ? "any" : undefined}
                    type={f.type ?? "text"}
                    value={input.state.value ?? ""}
                  />
                );
              }
              return (
                <Field className={fieldWidth(f)}>
                  <FieldLabel htmlFor={inputId}>
                    {f.label}
                    {f.required ? " *" : ""}
                  </FieldLabel>
                  {control}
                </Field>
              );
            }}
          </form.Field>
        );
        function removeTide(prefix: string, n: number) {
          const key = (slot: number, part: string) =>
            parameterKey(prefix, `tide${slot}${part}`);
          for (let slot = n; slot <= TIDE_SLOTS.length; slot++)
            for (const part of ["Type", "Time", "Height"])
              form.setFieldValue(
                key(slot, part),
                values[key(slot + 1, part)] ?? ""
              );
          setTideRows((rows) => ({
            ...rows,
            [prefix]: Math.max(1, (rows[prefix] ?? 1) - 1),
          }));
        }
        return (
          <div className="@container">
            <div className="grid @4xl:grid-cols-2 items-start gap-5">
              <Card className="gap-5 p-4 sm:p-6">
                {controls}
                <DirtyState dirty={dirty} onDirty={onDirty} />
                <AlertDialog onOpenChange={setWithdrawOpen} open={withdrawOpen}>
                  <AlertDialogContent>
                    <AlertDialogTitle>Withdraw publication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the published product from GMS. Its revision
                      history remains. If this had an escalated CAP Alert,
                      cancel it separately in CAP Admin — withdrawing here does
                      not do that automatically.
                    </AlertDialogDescription>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={pending}
                        onClick={() => {
                          setWithdrawOpen(false);
                          submit(values, "withdraw");
                        }}
                      >
                        Confirm withdrawal
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">
                      {revision ? `Revision ${revision}` : "New draft"}
                    </Badge>
                    {publishedRevision ? (
                      <Badge variant="light-success">
                        Published r{publishedRevision}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not published</Badge>
                    )}
                    {dirty ? (
                      <Badge variant="light-warning">Unsaved changes</Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isBulletin(kind) && revision === 0 ? (
                      <Button
                        onClick={() => {
                          replaceValues(bulletinExample(kind, issueDate));
                          setMessage(
                            "Illustrative draft loaded. Replace the example wording and review before issuing."
                          );
                        }}
                        type="button"
                        variant="outline"
                      >
                        Load example draft
                      </Button>
                    ) : null}
                    {capInsertTargets(kind).length ? (
                      <CapForecastPicker
                        disabled={pending || disabled}
                        onInsert={(target, text) => {
                          const appended = [values[target], text]
                            .filter(Boolean)
                            .join("\n\n");
                          if (appended.length > 12_000)
                            throw new Error(
                              "This would exceed the forecast field limit. Select less text or shorten the existing forecast."
                            );
                          form.setFieldValue(target, appended);
                          setReviewed(false);
                          setPreview(null);
                        }}
                        targets={capInsertTargets(kind)}
                      />
                    ) : null}
                  </div>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Forecaster</dt>
                  <dd>{values.forecaster}</dd>
                  {isForecastKind(kind) ? (
                    <>
                      <dt className="text-muted-foreground">Area</dt>
                      <dd>{values.area}</dd>
                      <dt className="text-muted-foreground">Issued</dt>
                      <dd>
                        {formatComputedValue(
                          values.issuedAt ?? "",
                          "datetime-local"
                        )}
                      </dd>
                      <dt className="text-muted-foreground">Valid</dt>
                      <dd>
                        {formatComputedValue(
                          values.validFrom ?? "",
                          "datetime-local"
                        )}{" "}
                        –{" "}
                        {formatComputedValue(
                          values.validTo ?? "",
                          "datetime-local"
                        )}
                        {values.validity ? (
                          <span className="block text-muted-foreground">
                            {values.validity}
                          </span>
                        ) : null}
                      </dd>
                    </>
                  ) : null}
                </dl>
                {message ? (
                  <p
                    className="whitespace-pre-wrap rounded-lg border p-4 text-sm"
                    role="status"
                  >
                    {message}
                  </p>
                ) : null}
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit(values, "draft");
                  }}
                >
                  <fieldset
                    className="space-y-4"
                    disabled={pending || disabled}
                  >
                    {sections.map((section) => {
                      const { group, prefix } = sectionParts(section);
                      const k = (name: string) => parameterKey(prefix, name);
                      const rows = tideRows[prefix] ?? 1;
                      return (
                        <section
                          className="@container space-y-4 rounded-lg border p-4"
                          key={section}
                        >
                          <h2 className="font-medium">
                            {section}
                            {DAY_SECTION.test(section) &&
                            values[`day${section.slice(4)}Date`] ? (
                              <span className="font-normal text-muted-foreground">
                                {" · "}
                                {formatComputedValue(
                                  values[`day${section.slice(4)}Date`],
                                  "date"
                                )}
                              </span>
                            ) : null}
                          </h2>
                          <div className="flex flex-wrap items-end gap-4">
                            {group === "Tides" ? (
                              <div className="flex basis-full flex-col gap-3">
                                {TIDE_SLOTS.slice(0, rows).map((n) => (
                                  <div
                                    className="flex flex-wrap items-end gap-3"
                                    key={n}
                                  >
                                    {fields
                                      .filter((f) =>
                                        f.key.startsWith(k(`tide${n}`))
                                      )
                                      .map(renderField)}
                                    <Button
                                      aria-label={`Remove tide ${n}${prefix ? ` (${section.split(" · ")[0]})` : ""}`}
                                      onClick={() => removeTide(prefix, n)}
                                      size="icon"
                                      type="button"
                                      variant="ghost"
                                    >
                                      <X />
                                    </Button>
                                  </div>
                                ))}
                                {rows < TIDE_SLOTS.length ? (
                                  <Button
                                    className="w-fit"
                                    onClick={() =>
                                      setTideRows((r) => ({
                                        ...r,
                                        [prefix]: rows + 1,
                                      }))
                                    }
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                  >
                                    <Plus data-icon="inline-start" />
                                    Add tide
                                  </Button>
                                ) : null}
                              </div>
                            ) : (
                              fields
                                .filter((f) => f.section === section)
                                .map(renderField)
                            )}
                          </div>
                          {group === "Wind" &&
                          windHint(
                            values[k("windSpeedMin")],
                            values[k("windSpeedMax")],
                            values[k("windGust")]
                          ) ? (
                            <p className="text-muted-foreground text-xs">
                              {windHint(
                                values[k("windSpeedMin")],
                                values[k("windSpeedMax")],
                                values[k("windGust")]
                              )}
                            </p>
                          ) : null}
                          {group === "Marine" &&
                          feetHint(
                            values[k("waveHeightMin")],
                            values[k("waveHeightMax")]
                          ) ? (
                            <p className="text-muted-foreground text-xs">
                              Waves{" "}
                              {feetHint(
                                values[k("waveHeightMin")],
                                values[k("waveHeightMax")]
                              )}
                              {values[k("swellHeight")]
                                ? ` · swell ${feetHint(values[k("swellHeight")])}`
                                : ""}
                            </p>
                          ) : null}
                          {group === "Visibility" &&
                          nauticalMilesHint(
                            values[k("visibilityMin")],
                            values[k("visibilityMax")]
                          ) ? (
                            <p className="text-muted-foreground text-xs">
                              {nauticalMilesHint(
                                values[k("visibilityMin")],
                                values[k("visibilityMax")]
                              )}
                            </p>
                          ) : null}
                          {legacyNote(section, values)}
                        </section>
                      );
                    })}
                    <p className="text-muted-foreground text-sm">
                      * Required to publish. All issue and validity times use
                      Grenada time (UTC−04:00).
                      {isForecastKind(kind)
                        ? " Coverage is calculated from the selected issue date. Early publications appear at their scheduled issue time. Warnings are supplied separately through CAP."
                        : ""}
                    </p>
                    <Field>
                      <FieldLabel htmlFor="change-summary">
                        Issue / revision note
                      </FieldLabel>
                      <Textarea
                        id="change-summary"
                        maxLength={1000}
                        onChange={(e) => setChangeSummary(e.target.value)}
                        value={changeSummary}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-3">
                      <Button type="submit">Save draft</Button>
                      <Button
                        onClick={() => review(values)}
                        type="button"
                        variant="outline"
                      >
                        Validate and preview
                      </Button>
                      {publishedRevision ? (
                        <Button
                          onClick={() => {
                            if (!changeSummary.trim()) {
                              setMessage(
                                "Explain the withdrawal in the revision note."
                              );
                              return;
                            }
                            setWithdrawOpen(true);
                          }}
                          type="button"
                          variant="outline"
                        >
                          Withdraw publication
                        </Button>
                      ) : null}
                    </div>
                  </fieldset>
                </form>
                {previewCurrent && preview ? (
                  <section
                    aria-label="Publication preview"
                    className="space-y-5 rounded-lg border p-5"
                  >
                    <p className="font-semibold text-sm">
                      Review before publication
                    </p>
                    <ProductContentView content={{ kind, values: preview }} />
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        checked={reviewed}
                        disabled={pending}
                        onChange={(e) => setReviewed(e.target.checked)}
                        type="checkbox"
                      />
                      I have checked the content, affected areas and validity
                      times and authorize publication.
                    </label>
                    <Button
                      disabled={!reviewed || pending}
                      onClick={() => submit(preview, "publish")}
                      type="button"
                    >
                      Publish to GMS
                    </Button>
                  </section>
                ) : null}
                {revision ? (
                  <section className="space-y-3">
                    <Button
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await loadProductHistoryAction(id);
                          if (result.ok) setHistory(result.history);
                          else setMessage(result.error);
                        })
                      }
                      type="button"
                      variant="outline"
                    >
                      View revision history
                    </Button>
                    <ul className="space-y-2">
                      {history.map((item) => (
                        <li
                          className="rounded-lg border p-3 text-sm"
                          key={item.revision}
                        >
                          Revision {item.revision} · {item.action} ·{" "}
                          {item.actorName} · {item.createdAt}
                          {item.changeSummary ? (
                            <p>{item.changeSummary}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </Card>
              <aside className="@4xl:sticky @4xl:top-4 min-w-0">
                <ProductPdfPreview
                  content={{ kind, values }}
                  dirty={dirty}
                  saved={{ id, revision, publishedRevision }}
                />
              </aside>
            </div>
          </div>
        );
      }}
    </form.Subscribe>
  );
}
function DirtyState({
  dirty,
  onDirty,
}: {
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  return null;
}
export function ProductDesk({
  kinds,
  title,
  initialKind,
}: {
  kinds: ProductKind[];
  title: string;
  initialKind?: ProductKind;
}) {
  const [kind, setKind] = useState(initialKind ?? kinds[0]);
  const [issueDate, setIssueDate] = useState(grenadaDate);
  const [issueTime, setIssueTime] = useState(
    ISSUE_TIMES[initialKind ?? kinds[0]]?.[0] ?? ""
  );
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [selected, setSelected] = useState<StoredProduct | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (reload < 0) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    loadProductsAction(kind, issueDate)
      .then((result) => {
        if (!active) return;
        if (result.ok) setProducts(result.products);
        else {
          setProducts([]);
          setLoadError(result.error);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoadError("Could not load products.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [kind, issueDate, reload]);
  function leave(action: () => void) {
    if (saving) return;
    if (dirty) setDiscard(() => action);
    else action();
  }
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-medium text-3xl tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">
          Save a draft, check the preview, then publish. Revisions preserve the
          currently published product until you issue the update.
        </p>
      </header>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDiscard(null);
        }}
        open={discard !== null}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Save a draft first if you want to keep these changes.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                discard?.();
                setDiscard(null);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ProductEditor
        controls={
          <>
            {kinds.length > 1 ? (
              <Tabs
                onValueChange={(value) => {
                  const next = value as ProductKind;
                  if (next === kind) return;
                  leave(() => {
                    setKind(next);
                    setIssueTime(ISSUE_TIMES[next]?.[0] ?? "");
                    setSelected(null);
                    setDirty(false);
                    setEditorKey((key) => key + 1);
                  });
                }}
                value={kind}
              >
                <TabsList className="h-9 w-full justify-start overflow-x-auto rounded-lg bg-foreground/5 p-1 sm:justify-center">
                  {kinds.map((value) => (
                    <TabsTrigger
                      className="font-normal text-muted-foreground data-active:text-foreground"
                      key={value}
                      value={value}
                    >
                      {isForecastKind(value)
                        ? value[0].toUpperCase() + value.slice(1)
                        : productTitle(value)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="desk-date">
                  Forecast / issue date
                </FieldLabel>
                <Input
                  id="desk-date"
                  onChange={(event) => {
                    const date = event.target.value;
                    if (!date) return;
                    leave(() => {
                      setIssueDate(date);
                      setSelected(null);
                      setDirty(false);
                      setEditorKey((key) => key + 1);
                    });
                  }}
                  type="date"
                  value={issueDate}
                />
              </Field>
              {ISSUE_TIMES[kind] ? (
                <Field>
                  <FieldLabel htmlFor="desk-time">
                    Scheduled issue (Grenada time)
                  </FieldLabel>
                  <Select
                    onValueChange={(value) => {
                      if (!value) return;
                      leave(() => {
                        setIssueTime(value);
                        setSelected(null);
                        setDirty(false);
                        setEditorKey((key) => key + 1);
                      });
                    }}
                    value={issueTime}
                  >
                    <SelectTrigger id="desk-time">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_TIMES[kind]?.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
            </div>
            <ProductList
              error={loadError}
              issueDate={issueDate}
              loading={loading}
              onNew={() => {
                leave(() => {
                  setSelected(null);
                  setDirty(false);
                  setEditorKey((key) => key + 1);
                });
              }}
              onRetry={() => setReload((value) => value + 1)}
              onSelect={(product) => {
                leave(() => {
                  setSelected(product);
                  setDirty(false);
                  setEditorKey((key) => key + 1);
                });
              }}
              productKind={kind}
              products={products}
              selectedId={selected?.id}
            />
          </>
        }
        disabled={loading}
        initial={selected}
        issueDate={issueDate}
        issueTime={issueTime}
        key={`${kind}-${editorKey}`}
        kind={kind}
        onBusy={setSaving}
        onDirty={setDirty}
        onSaved={(product) =>
          setProducts((items) => [
            product,
            ...items.filter((item) => item.id !== product.id),
          ])
        }
      />
    </div>
  );
}
