"use client";

import type { GuidanceSystem, ProductGuidance } from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { ProductContentView } from "@barrelsgd/gms/components/product-content";
import {
  capInsertTargets,
  emptyProduct,
  grenadaDate,
  isBulletin,
  isComposedForecastField,
  isForecastKind,
  PRODUCT_KINDS,
  type ProductField,
  type ProductKind,
  type ProductValues,
  parameterKey,
  productFields,
  type StoredProduct,
  TIDE_SLOTS,
} from "@barrelsgd/gms/products";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Card } from "@barrelsgd/ui/components/ui/card";
import {
  Field,
  FieldContent,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@barrelsgd/ui/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@barrelsgd/ui/components/ui/tabs";
import { cn } from "@barrelsgd/ui/lib/utils";
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
import { DeskLayout } from "@/components/document/desk-layout";
import { PageHeader } from "@/components/layout/page-header";
import type { PdfPreviewRequest } from "@/components/wxproducts/forecast-pdf-frame";
import { ProductPdfPreview } from "@/components/wxproducts/product-pdf-preview";
import { bulletinExample } from "@/lib/wxproducts/bulletin-examples";
import { visibleProductFields } from "@/lib/wxproducts/visible-fields";
import { CapForecastPicker } from "./cap-forecast-picker";
import { NhcGuidanceEditor } from "./nhc-guidance-editor";
import { ProductDiscardDialog } from "./product-discard-dialog";
import {
  ProductFieldControl,
  sectionParts,
  startsRow,
} from "./product-field-control";
import { type HistoryItem, ProductHistoryPanel } from "./product-history-panel";
import { ProductList } from "./product-list";
import { ProductWithdrawDialog } from "./product-withdraw-dialog";
import { SectionHints } from "./section-hints";

const DAY_KEY_PREFIX = /^(day[1-4])/;

function productTabLabel(kind: ProductKind) {
  if (isForecastKind(kind)) return kind.charAt(0).toUpperCase() + kind.slice(1);
  if (kind === "tsunami") return "Tsunami / Earthquake";
  return PRODUCT_KINDS[kind];
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
    ? key.charAt(day.length).toLowerCase() + key.slice(day.length + 1)
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
function ForecastPeriodFields({
  evening,
  period,
  children,
}: {
  evening: boolean;
  period: string;
  children: ReactNode;
}) {
  if (!evening) return <div className="space-y-4">{children}</div>;
  return (
    <div
      aria-labelledby={`evening-${period || "tonight"}-tab`}
      className="space-y-4"
      id="evening-period-panel"
      role="tabpanel"
    >
      {children}
    </div>
  );
}

function ProductEditor({
  kind,
  initial,
  issueDate,
  onSaved,
  onDirty,
  onBusy,
  disabled,
  controls,
  archive,
  sourceEditionIds,
  existingSystems,
  lastIssued,
}: {
  lastIssued: StoredProduct | null;
  sourceEditionIds: string[];
  existingSystems: GuidanceSystem[];
  archive: ReactNode;
  controls: ReactNode;
  kind: ProductKind;
  initial: StoredProduct | null;
  issueDate: string;
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
      initial?.values ?? emptyProduct(kind, issueDate),
      sessionUser.full_name ?? sessionUser.email
    )
  );
  const [guidance, setGuidance] = useState<ProductGuidance | null>(
    initial?.guidance ?? null
  );
  const [guidanceBaseline, setGuidanceBaseline] = useState(() =>
    JSON.stringify(initial?.guidance ?? null)
  );
  const [previewGuidance, setPreviewGuidance] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(() => JSON.stringify(start));
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [preview, setPreview] = useState<ProductValues | null>(null);
  const [pdfRequest, setPdfRequest] = useState<PdfPreviewRequest | null>(null);
  const [pdfExpanded, setPdfExpanded] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [changeSummary, setChangeSummary] = useState("");
  const [period, setPeriod] = useState("");
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
  function refreshPdf(
    values: ProductValues,
    expectedRevision: number,
    open = false,
    selectedGuidance: ProductGuidance | null = guidance
  ) {
    setPdfRequest((previous) => ({
      content: {
        kind,
        values: { ...values },
        guidance: selectedGuidance ? structuredClone(selectedGuidance) : null,
      },
      expectedRevision,
      requestId: (previous?.requestId ?? 0) + 1,
    }));
    if (open) setPdfExpanded(true);
  }
  function replaceValues(values: ProductValues) {
    setDefaultValues(values);
    form.reset(values);
  }
  /**
   * Forecast wording usually changes little between issues, so a new forecast
   * can start from the last published one. Issue time, validity, area and
   * forecaster are never carried over, and the usual review still gates
   * publication. Hazard bulletins and outlooks are not offered this: each
   * must be assessed afresh.
   */
  function startFromLastIssued(last: StoredProduct) {
    const fresh = withIssuer(
      kind,
      emptyProduct(kind, issueDate),
      sessionUser.full_name ?? sessionUser.email
    );
    const carried = Object.fromEntries(
      Object.entries(last.values).filter(
        ([key]) => key in fresh && !isComputedField(kind, key)
      )
    );
    replaceValues({ ...fresh, ...carried });
    setReviewed(false);
    setPreview(null);
    setMessage(
      `Copied from the last issued ${PRODUCT_KINDS[kind]} (saved ${format(parseISO(last.updatedAt), "d MMM yyyy, HH:mm")}). Issue time, validity, area and forecaster are set for today. Check every section against current conditions before publishing.`
    );
  }
  const fields = visibleProductFields(kind).filter(
    (f) =>
      !(
        isComputedField(kind, f.key) ||
        (kind === "outlook" &&
          guidance?.systems?.length &&
          [
            "systems",
            "formationChance48h",
            "formationChance7d",
            "source",
          ].includes(f.key))
      )
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
      guidance,
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
    setGuidance(result.product.guidance ?? null);
    setGuidanceBaseline(JSON.stringify(result.product.guidance ?? null));
    setBaseline(JSON.stringify(result.product.values));
    replaceValues(result.product.values);
    refreshPdf(
      result.product.values,
      result.product.revision,
      false,
      result.product.guidance ?? null
    );
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
          guidance,
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
        const reviewedGuidance = result.preview.guidance ?? guidance;
        setGuidance(reviewedGuidance);
        setPreviewGuidance(JSON.stringify(reviewedGuidance));
        refreshPdf(result.preview.values, revision, true, reviewedGuidance);
      } finally {
        onBusy(false);
      }
    });
  }
  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => {
        const dirty =
          JSON.stringify(values) !== baseline ||
          JSON.stringify(guidance) !== guidanceBaseline;
        const previewCurrent =
          preview !== null &&
          previewGuidance === JSON.stringify(guidance) &&
          JSON.stringify(preview) === JSON.stringify(values);
        const renderField = (f: ProductField) => (
          <form.Field key={f.key} name={f.key}>
            {(input) => (
              <ProductFieldControl
                field={f}
                kind={kind}
                onChange={input.handleChange}
                value={input.state.value}
              />
            )}
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
          // Editor, preview and archive side by side: always full width.
          <div className="@container" data-content-width="wide">
            <DeskLayout
              archive={archive}
              editor={
                <Card className="gap-4 p-4">
                  {controls}
                  {kind === "evening" ? (
                    <Tabs
                      onValueChange={(value) => setPeriod(String(value))}
                      value={period}
                    >
                      <TabsList
                        aria-label="Evening forecast period"
                        className="w-full max-w-full justify-start overflow-x-auto"
                      >
                        {PERIOD_PREFIXES.map((prefix, index) => (
                          <TabsTrigger
                            aria-controls="evening-period-panel"
                            disabled={pending || disabled}
                            id={`evening-${prefix || "tonight"}-tab`}
                            key={prefix}
                            value={prefix}
                          >
                            {index ? `Day ${index}` : "Tonight"}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  ) : null}
                  <DirtyState dirty={dirty} onDirty={onDirty} />
                  <ProductWithdrawDialog
                    onConfirm={() => {
                      setWithdrawOpen(false);
                      submit(values, "withdraw");
                    }}
                    onOpenChange={setWithdrawOpen}
                    open={withdrawOpen}
                    pending={pending}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
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
                      {isForecastKind(kind) && revision === 0 && lastIssued ? (
                        <Button
                          disabled={pending || disabled}
                          onClick={() => startFromLastIssued(lastIssued)}
                          type="button"
                          variant="outline"
                        >
                          Start from last issued
                        </Button>
                      ) : null}
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
                      {(kind === "outlook" ||
                        kind === "cyclone" ||
                        kind === "marine") && (
                        <NhcGuidanceEditor
                          disabled={pending || disabled}
                          existingSystems={existingSystems}
                          guidance={guidance}
                          kind={kind}
                          onChange={(next, proposedValues) => {
                            setGuidance(next);
                            if (proposedValues) replaceValues(proposedValues);
                            setReviewed(false);
                            setPreview(null);
                          }}
                          sourceEditionIds={sourceEditionIds}
                          values={values}
                        />
                      )}
                      <ForecastPeriodFields
                        evening={kind === "evening"}
                        period={period}
                      >
                        {sections
                          .filter(
                            (section) =>
                              kind !== "evening" ||
                              sectionParts(section).prefix === period
                          )
                          .map((section) => {
                            const { group, prefix } = sectionParts(section);
                            let heading = section;
                            if (kind === "evening" && period)
                              heading = DAY_SECTION.test(section)
                                ? "Weather"
                                : group;
                            const k = (name: string) =>
                              parameterKey(prefix, name);
                            const rows = tideRows[prefix] ?? 1;
                            const sectionFields = fields
                              .filter((f) => f.section === section)
                              .sort(
                                (a, b) =>
                                  Number(a.type === "textarea") -
                                  Number(b.type === "textarea")
                              );
                            return (
                              <section
                                aria-label={`${section} fields`}
                                className="@container space-y-3 border-t pt-4 first:border-t-0 first:pt-0"
                                key={section}
                              >
                                <h2 className="font-semibold text-sm leading-5">
                                  {heading}
                                  {group === "Wind" ? (
                                    <span className="font-normal text-muted-foreground text-xs">
                                      {" "}
                                      · mph
                                    </span>
                                  ) : null}
                                  {DAY_SECTION.test(section) &&
                                  values[`day${section.slice(4)}Date`] ? (
                                    <span className="font-normal text-muted-foreground">
                                      {" · "}
                                      {formatComputedValue(
                                        values[`day${section.slice(4)}Date`] ??
                                          "",
                                        "date"
                                      )}
                                    </span>
                                  ) : null}
                                </h2>
                                <div
                                  className={cn(
                                    "flex flex-wrap items-end gap-2",
                                    group === "Astronomy" &&
                                      "grid max-w-sm grid-cols-2",
                                    group === "Word of the day" && "items-start"
                                  )}
                                >
                                  {group === "Tides" ? (
                                    <div className="flex basis-full flex-col gap-2">
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
                                            onClick={() =>
                                              removeTide(prefix, n)
                                            }
                                            size="icon-sm"
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
                                    sectionFields.flatMap((f, index) =>
                                      startsRow(f, sectionFields[index - 1])
                                        ? [
                                            <div
                                              aria-hidden="true"
                                              className="h-0 basis-full"
                                              key={`${f.key}-row`}
                                            />,
                                            renderField(f),
                                          ]
                                        : [renderField(f)]
                                    )
                                  )}
                                </div>
                                <SectionHints
                                  group={group}
                                  prefix={prefix}
                                  values={values}
                                />
                                {legacyNote(section, values)}
                              </section>
                            );
                          })}
                      </ForecastPeriodFields>
                      <div className="space-y-2 text-muted-foreground text-xs">
                        <p>
                          * Required to publish. Times: Grenada (UTC−04:00).
                        </p>
                        {isForecastKind(kind) ? (
                          <details>
                            <summary className="cursor-pointer">
                              Forecast timing and warning sources
                            </summary>
                            <p className="pt-2">
                              Validity is calculated from the issue date. Early
                              publications enter the current forecast feed at
                              their scheduled issue time. CAP alerts and hazard
                              bulletins remain the official warning sources.
                            </p>
                          </details>
                        ) : null}
                      </div>
                      <Field
                        className="items-start gap-2 [&>[data-slot=field-label]]:flex-none"
                        orientation="horizontal"
                      >
                        <FieldLabel
                          className="text-body-sm leading-body-sm"
                          htmlFor="change-summary"
                        >
                          <span aria-hidden="true">Revision note:</span>
                          <span className="sr-only">Issue / revision note</span>
                        </FieldLabel>
                        <FieldContent className="min-w-0 flex-1 gap-2">
                          <InputGroup>
                            {revision > 0 ? (
                              <InputGroupAddon
                                align="inline-start"
                                aria-hidden="true"
                                className="pointer-events-none self-start text-destructive text-xs"
                              >
                                *
                              </InputGroupAddon>
                            ) : null}
                            <InputGroupTextarea
                              aria-describedby={
                                revision ? "change-summary-hint" : undefined
                              }
                              aria-label="Issue / revision note"
                              id="change-summary"
                              maxLength={1000}
                              onChange={(e) => setChangeSummary(e.target.value)}
                              rows={2}
                              value={changeSummary}
                            />
                          </InputGroup>
                          {revision > 0 ? (
                            <p
                              className="text-muted-foreground text-xs"
                              id="change-summary-hint"
                            >
                              Required to validate and publish a saved draft,
                              including its first publication.
                            </p>
                          ) : null}
                        </FieldContent>
                      </Field>
                      {message ? (
                        <p
                          className="whitespace-pre-wrap rounded-lg border p-3 text-sm"
                          role="status"
                        >
                          {message}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
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
                      className="space-y-4 rounded-lg border p-4"
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
                    <ProductHistoryPanel
                      history={history}
                      onLoad={() =>
                        startTransition(async () => {
                          const result = await loadProductHistoryAction(id);
                          if (result.ok) setHistory(result.history);
                          else setMessage(result.error);
                        })
                      }
                      pending={pending}
                    />
                  ) : null}
                </Card>
              }
              preview={
                <ProductPdfPreview
                  busy={pending || disabled}
                  content={{ kind, values, guidance }}
                  dirty={dirty}
                  expanded={pdfExpanded}
                  onExpandedChange={setPdfExpanded}
                  onPreview={() => refreshPdf(values, revision, true)}
                  request={pdfRequest}
                  saved={{ id, revision, publishedRevision }}
                />
              }
            />
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
  sourceEditionIds = [],
}: {
  kinds: [ProductKind, ...ProductKind[]];
  title: string;
  initialKind?: ProductKind;
  sourceEditionIds?: string[];
}) {
  const [kind, setKind] = useState(initialKind ?? kinds[0]);
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [selected, setSelected] = useState<StoredProduct | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [archivePage, setArchivePage] = useState(0);
  const deskKinds = kinds.includes(kind) ? kinds : [...kinds, kind];
  const hasAlertTabs = deskKinds.some((value) => !isForecastKind(value));
  useEffect(() => {
    if (reload < 0) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    loadProductsAction(undefined, undefined, archivePage * 50)
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
  }, [archivePage, reload]);
  function leave(action: () => void) {
    if (saving) return;
    if (dirty) setDiscard(() => action);
    else action();
  }
  return (
    <div className="space-y-4">
      <PageHeader
        description="Save a draft, check the preview, then publish. Revisions preserve the currently published product until you issue the update."
        title={title}
      />
      <ProductDiscardDialog
        onConfirm={() => {
          discard?.();
          setDiscard(null);
        }}
        onOpenChange={(open) => {
          if (!open) setDiscard(null);
        }}
        open={discard !== null}
      />
      <ProductEditor
        archive={
          <ProductList
            error={loadError}
            loading={loading}
            onNew={() => {
              leave(() => {
                setSelected(null);
                setDirty(false);
                setEditorKey((key) => key + 1);
              });
            }}
            onPageChange={setArchivePage}
            onRetry={() => setReload((value) => value + 1)}
            onSelect={(product) => {
              leave(() => {
                setKind(product.kind);
                setSelected(product);
                setDirty(false);
                setEditorKey((key) => key + 1);
              });
            }}
            page={archivePage}
            productKind={kind}
            products={products}
            selectedId={selected?.id}
          />
        }
        controls={
          deskKinds.length > 1 ? (
            <Tabs
              onValueChange={(value) => {
                const next = value as ProductKind;
                if (next === kind) return;
                leave(() => {
                  setKind(next);
                  setSelected(null);
                  setDirty(false);
                  setEditorKey((key) => key + 1);
                });
              }}
              value={kind}
            >
              <TabsList
                aria-label="Product type"
                className={cn(
                  "h-8 w-full justify-start overflow-x-auto rounded-lg bg-muted p-1 sm:justify-center",
                  hasAlertTabs &&
                    "grid h-auto @2xl:grid-cols-5 @sm:grid-cols-3 grid-cols-2 gap-1 overflow-visible group-data-[orientation=horizontal]/tabs:h-auto"
                )}
              >
                {deskKinds.map((value) => (
                  <TabsTrigger
                    className={cn(
                      hasAlertTabs &&
                        "h-auto min-h-10 whitespace-normal text-balance px-2 py-1 text-center leading-4"
                    )}
                    key={value}
                    value={value}
                  >
                    {productTabLabel(value)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null
        }
        disabled={loading}
        existingSystems={[
          ...new Map(
            products
              .flatMap((product) => product.guidance?.systems ?? [])
              .map((system) => [system.id, system])
          ).values(),
        ]}
        initial={selected}
        issueDate={grenadaDate()}
        key={`${kind}-${editorKey}`}
        kind={kind}
        lastIssued={
          products.find(
            (product) => product.kind === kind && product.publishedRevision
          ) ?? null
        }
        onBusy={setSaving}
        onDirty={setDirty}
        onSaved={() => {
          setArchivePage(0);
          setReload((value) => value + 1);
        }}
        sourceEditionIds={sourceEditionIds}
      />
    </div>
  );
}
