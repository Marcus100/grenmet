"use client";

import {
  type CapAlertPublic,
  type CapAreaCreate,
  type CapCatalogsPublic,
  type CapCategory,
  type CapSettingsPublic,
  capCreateAlert,
  capUpdateAlert,
  type GmsColour,
  type PublicPublishedProduct,
  wxproductsListPublicProducts,
} from "@barrelsgd/api-client";
import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import type { SectorKey } from "@barrelsgd/gms/sectors";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useId, useMemo, useState } from "react";
import { AreaPicker } from "@/components/desk/area-picker";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import { useGmsCatalogue } from "@/components/desk/gms-catalogue";
import { HazardClassification } from "@/components/desk/hazard-classification";
import {
  LivePreview,
  ReadinessChecklist,
} from "@/components/desk/live-preview";
import { RiskLadder } from "@/components/desk/risk-ladder";
import { SectorCheckboxes } from "@/components/desk/sector-checkboxes";
import { WarningLevelPicker } from "@/components/desk/warning-level-picker";
import {
  type AlertFields,
  type AlertFormState,
  blockingError,
  buildCreatePayload,
  buildUpdatePayload,
  type EditCarryOver,
  emptyForm,
  formFromAlert,
} from "@/lib/desk/alert-form";
import {
  readSourceBulletinLink,
  sourceBulletinParameters,
} from "@/lib/desk/cap/cap-bulletin-link";
import {
  type GmsProduct,
  levelHeading,
  needsColour,
  severityForColour,
} from "@/lib/desk/cap/cap-levels";
import {
  CERTAINTY_ORDER,
  SEVERITY_ORDER,
  URGENCY_ORDER,
} from "@/lib/desk/cap/cap-severity";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";

export type AlertEditorProps = {
  catalogs: CapCatalogsPublic;
  settings?: CapSettingsPublic | null;
} & ({ mode: "create" } | { alert: CapAlertPublic; mode: "edit" });

function Field({
  children,
  htmlFor,
  label,
  required,
}: {
  children: ReactNode;
  htmlFor?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="font-medium text-caption" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}

function NativeSelect({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <Field htmlFor={id} label={label} required>
      <select
        className="h-9 w-fit rounded-md border border-input bg-background px-2 text-body"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Create a warning, or edit a saved draft (PATCH). Only the content is edited
 * here; review, approval and publishing happen on the alert page. Editing a
 * submitted or approved alert sends it back to Draft (FastAPI), and the page
 * says so before saving.
 */
export function AlertEditor(props: AlertEditorProps) {
  const catalogue = useGmsCatalogue();
  const router = useRouter();
  const id = useId();
  const editing = props.mode === "edit" ? props.alert : null;
  const initial = useMemo<{
    carryOver: EditCarryOver | null;
    form: AlertFormState;
  }>(() => {
    if (editing) return formFromAlert(editing, catalogue);
    return { carryOver: null, form: emptyForm(props.settings) };
  }, [editing, catalogue, props.settings]);
  const [form, setForm] = useState<AlertFormState>(initial.form);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<DeskError | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [bulletins, setBulletins] = useState<PublicPublishedProduct[]>([]);
  const [bulletinMessage, setBulletinMessage] = useState("");
  const [bulletinsLoading, setBulletinsLoading] = useState(false);

  const { fields } = form;
  const hasLevel =
    form.product !== null &&
    (!needsColour(catalogue, form.product) || form.colour !== null);
  const linked = readSourceBulletinLink(form.sourceParameters);
  const backHref = (editing ? `/desk/alerts/${editing.id}` : "/desk") as Route;
  const resetsReview =
    editing?.lifecycle_state === "SUBMITTED" ||
    editing?.lifecycle_state === "APPROVED";

  function setField<K extends keyof AlertFields>(
    key: K,
    value: AlertFields[K]
  ) {
    setForm((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }));
  }

  /** The colour sets CAP severity, so the two cannot disagree. */
  function changeLevel(product: GmsProduct, colour: GmsColour | null) {
    setForm((prev) => {
      const next = { ...prev, colour, product };
      if (colour) {
        return {
          ...next,
          fields: {
            ...prev.fields,
            severity: severityForColour(catalogue, colour),
          },
        };
      }
      if (product === "Outlook") {
        return {
          ...next,
          fields: {
            ...prev.fields,
            certainty:
              prev.fields.certainty === "Unknown"
                ? "Possible"
                : prev.fields.certainty,
            urgency:
              prev.fields.urgency === "Unknown"
                ? "Future"
                : prev.fields.urgency,
          },
        };
      }
      return next;
    });
  }

  const setAreas = useCallback((areas: CapAreaCreate[]) => {
    setForm((prev) => ({ ...prev, areas }));
  }, []);

  async function loadBulletins() {
    setBulletinsLoading(true);
    try {
      const result = await wxproductsListPublicProducts().unwrap();
      const items = result.products.filter((item) =>
        Object.hasOwn(BULLETIN_CATEGORIES, item.kind)
      );
      setBulletins(items);
      setBulletinMessage(
        items.length
          ? "Choose a published bulletin to link its exact revision."
          : "No current published bulletins. You can still save this alert."
      );
    } catch {
      setBulletins([]);
      setBulletinMessage(
        "Bulletins could not be loaded. You can still save this alert."
      );
    } finally {
      setBulletinsLoading(false);
    }
  }

  function chooseBulletin(value: string) {
    const bulletin = bulletins.find((item) => item.id === value);
    setForm((prev) => ({
      ...prev,
      sourceParameters: bulletin ? sourceBulletinParameters(bulletin) : [],
    }));
  }

  async function save() {
    const blocked = blockingError(form, catalogue);
    setProblem(blocked);
    setError(null);
    if (blocked || saving) return;
    setSaving(true);
    try {
      const saved = editing
        ? await capUpdateAlert({
            body: buildUpdatePayload(
              form,
              catalogue,
              initial.carryOver as EditCarryOver
            ),
            path: { alert_id: editing.id },
          }).unwrap()
        : await capCreateAlert({
            body: buildCreatePayload(form, catalogue),
          }).unwrap();
      router.push(`/desk/alerts/${saved.id}` as Route);
      router.refresh();
    } catch (caught) {
      setError(describeDeskError(caught));
      setSaving(false);
    }
  }

  const areaDesc = form.areas.map((area) => area.area_desc).join("; ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link className="text-body-sm text-info underline" href={backHref}>
            {editing ? "Back to the alert" : "Back to the board"}
          </Link>
          <h1 className="mt-2 font-semibold text-2xl">
            {editing ? "Edit draft" : "New warning"}
          </h1>
          {editing ? (
            <p className="text-body-sm text-muted-foreground">
              {editing.msg_type} · {editing.identifier}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={backHref}>Cancel</Link>
          </Button>
          <Button disabled={saving} onClick={save} type="button">
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </div>

      {resetsReview ? (
        <p
          className="rounded-lg border border-warning bg-warning-soft p-3 text-body-sm text-warning-soft-foreground"
          role="status"
        >
          This alert is {editing?.lifecycle_state.toLowerCase()}. Saving a
          change sends it back to Draft: it will need approval again before it
          can be published.
        </p>
      ) : null}
      {editing && (editing.references ?? []).length > 0 ? (
        <p className="text-body-sm" role="status">
          This {editing.msg_type} replaces{" "}
          {(editing.references ?? []).map((item) => item.identifier).join(", ")}{" "}
          when published. The reference is kept as it is.
        </p>
      ) : null}
      {editing?.import_source ? (
        <p
          className="rounded-lg border border-warning bg-warning-soft p-3 text-body-sm text-warning-soft-foreground"
          role="status"
        >
          Imported alert ({editing.import_source}). Publishing it still needs
          you to confirm you checked it against the source.
        </p>
      ) : null}
      {initial.carryOver && initial.carryOver.otherInfo.length > 0 ? (
        <p className="text-body-sm text-muted-foreground" role="status">
          This alert has {initial.carryOver.otherInfo.length + 1} information
          blocks. The desk edits the first; the others are saved unchanged.
        </p>
      ) : null}

      {problem ? (
        <p
          className="rounded-lg border border-destructive bg-destructive/10 p-3 text-body-sm text-destructive"
          role="alert"
        >
          {problem}
        </p>
      ) : null}
      <DeskErrorNotice error={error} />

      {fields.status === "Actual" ? null : (
        <div
          className="rounded-lg border-2 border-destructive bg-warning-soft p-3 text-warning-soft-foreground"
          role="alert"
        >
          <p className="font-bold text-body-sm uppercase tracking-wide">
            Status: {fields.status}. This is not a live warning
          </p>
          <p className="mt-1 text-body-sm">
            The public site labels this message as a drill and tells readers to
            take no protective action. Set the status to Actual before issuing a
            real warning.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Section title="Message">
            <Field htmlFor={`${id}-headline`} label="Headline" required>
              <Input
                id={`${id}-headline`}
                onChange={(event) => setField("headline", event.target.value)}
                placeholder="e.g. Tropical Storm Warning for Grenada"
                value={fields.headline}
              />
            </Field>
            <div className="flex flex-wrap gap-4">
              <NativeSelect
                id={`${id}-status`}
                label="Status"
                onChange={(value) =>
                  setField("status", value as AlertFields["status"])
                }
                options={props.catalogs.statuses}
                value={fields.status}
              />
              <NativeSelect
                id={`${id}-scope`}
                label="Scope"
                onChange={(value) =>
                  setField("scope", value as AlertFields["scope"])
                }
                options={props.catalogs.scopes}
                value={fields.scope}
              />
              <NativeSelect
                id={`${id}-language`}
                label="Language"
                onChange={(value) => setField("language", value)}
                options={props.catalogs.languages}
                value={fields.language}
              />
            </div>
          </Section>

          <Section title="Hazard">
            <HazardClassification
              categories={form.categories}
              event={fields.event}
              onCategoriesChange={(categories: CapCategory[]) =>
                setForm((prev) => ({ ...prev, categories }))
              }
              onEventChange={(event: string, categories: CapCategory[]) =>
                setForm((prev) => ({
                  ...prev,
                  categories,
                  fields: { ...prev.fields, event },
                }))
              }
            />
          </Section>

          <Section title="Level and risk">
            <p className="text-body-sm text-muted-foreground">
              Unknown means not assessed; it does not mean low risk.
            </p>
            <WarningLevelPicker
              colour={form.colour}
              onChange={changeLevel}
              product={form.product}
            />
            <SectorCheckboxes
              onChange={(sectors: SectorKey[]) =>
                setForm((prev) => ({ ...prev, sectors }))
              }
              value={form.sectors}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              {form.colour ? (
                <div className="grid gap-1.5">
                  <span className="font-medium text-caption">Severity</span>
                  <span className="rounded-md border px-3 py-2 font-semibold text-caption">
                    {fields.severity} (from colour)
                  </span>
                </div>
              ) : (
                <RiskLadder
                  colored
                  label="Severity"
                  onChange={(value) => setField("severity", value)}
                  options={SEVERITY_ORDER}
                  value={fields.severity}
                />
              )}
              <RiskLadder
                label="Urgency"
                onChange={(value) => setField("urgency", value)}
                options={URGENCY_ORDER}
                value={fields.urgency}
              />
              <RiskLadder
                label="Certainty"
                onChange={(value) => setField("certainty", value)}
                options={CERTAINTY_ORDER}
                value={fields.certainty}
              />
            </div>
          </Section>

          <Section title="Affected areas">
            <AreaPicker
              initialAreas={initial.form.areas}
              onAreasChange={setAreas}
              severity={fields.severity}
            />
          </Section>

          <Section title="Description">
            <Field htmlFor={`${id}-description`} label="Description" required>
              <Textarea
                className="min-h-28"
                id={`${id}-description`}
                onChange={(event) =>
                  setField("description", event.target.value)
                }
                value={fields.description}
              />
            </Field>
            <Field htmlFor={`${id}-instruction`} label="Instruction">
              <Textarea
                className="min-h-20"
                id={`${id}-instruction`}
                onChange={(event) =>
                  setField("instruction", event.target.value)
                }
                value={fields.instruction}
              />
            </Field>
            <Field htmlFor={`${id}-note`} label="Note (staff only)">
              <Input
                id={`${id}-note`}
                onChange={(event) => setField("note", event.target.value)}
                value={fields.note}
              />
            </Field>
          </Section>

          <Section title="Source bulletin (optional)">
            {linked ? (
              <div className="flex flex-wrap items-center gap-3 text-body-sm">
                <span>
                  Linked:{" "}
                  {BULLETIN_CATEGORIES[
                    linked.kind as keyof typeof BULLETIN_CATEGORIES
                  ] ?? linked.kind}{" "}
                  · revision {linked.revision}
                </span>
                <Button
                  onClick={() =>
                    setForm((prev) => ({ ...prev, sourceParameters: [] }))
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Remove link
                </Button>
              </div>
            ) : null}
            <Button
              disabled={bulletinsLoading}
              onClick={loadBulletins}
              type="button"
              variant="outline"
            >
              {bulletinsLoading
                ? "Loading bulletins…"
                : "Load published bulletins"}
            </Button>
            {bulletinMessage ? (
              <p className="text-body-sm" role="status">
                {bulletinMessage}
              </p>
            ) : null}
            {bulletins.length > 0 ? (
              <select
                aria-label="Source bulletin"
                className="h-9 rounded-md border border-input bg-background px-2 text-body"
                defaultValue=""
                onChange={(event) => chooseBulletin(event.target.value)}
              >
                <option value="">No source bulletin</option>
                {bulletins.map((item) => (
                  <option key={item.id} value={item.id}>
                    {
                      BULLETIN_CATEGORIES[
                        item.kind as keyof typeof BULLETIN_CATEGORIES
                      ]
                    }{" "}
                    · {item.values.issuedAt ?? item.publishedAt} · revision{" "}
                    {item.revision}
                  </option>
                ))}
              </select>
            ) : null}
          </Section>

          <Section title="Timing and sender">
            <div className="flex flex-wrap gap-4">
              {(["effective", "onset", "expires"] as const).map((key) => (
                <Field
                  htmlFor={`${id}-${key}`}
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                >
                  <Input
                    className="w-56"
                    id={`${id}-${key}`}
                    onChange={(event) => setField(key, event.target.value)}
                    type="datetime-local"
                    value={fields[key]}
                  />
                </Field>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor={`${id}-sender`} label="Sender name">
                <Input
                  id={`${id}-sender`}
                  onChange={(event) =>
                    setField("senderName", event.target.value)
                  }
                  value={fields.senderName}
                />
              </Field>
              <Field htmlFor={`${id}-contact`} label="Contact">
                <Input
                  id={`${id}-contact`}
                  onChange={(event) => setField("contact", event.target.value)}
                  value={fields.contact}
                />
              </Field>
            </div>
            <Field htmlFor={`${id}-web`} label="Web address">
              <Input
                id={`${id}-web`}
                onChange={(event) => setField("web", event.target.value)}
                type="url"
                value={fields.web}
              />
            </Field>
          </Section>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <LivePreview
            areaDesc={areaDesc}
            colour={form.colour}
            contact={fields.contact}
            description={fields.description}
            effective={fields.effective || "Not set"}
            expires={fields.expires || "Not set"}
            headline={fields.headline}
            instruction={fields.instruction}
            levelHeading={
              form.product
                ? levelHeading(
                    catalogue,
                    fields.event,
                    form.product,
                    form.colour
                  )
                : undefined
            }
            outlook={form.product === "Outlook"}
            senderName={fields.senderName}
            severity={fields.severity}
            urgency={fields.urgency}
          />
          <ReadinessChecklist
            hasArea={form.areas.length > 0}
            hasLevel={hasLevel}
            hasMessage={Boolean(
              fields.headline.trim() &&
                fields.event.trim() &&
                fields.description.trim()
            )}
            isActualStatus={fields.status === "Actual"}
            riskAssessed={
              fields.severity !== "Unknown" ||
              fields.urgency !== "Unknown" ||
              fields.certainty !== "Unknown"
            }
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button asChild variant="outline">
          <Link href={backHref}>Cancel</Link>
        </Button>
        <Button disabled={saving} onClick={save} type="button">
          {saving ? "Saving…" : "Save draft"}
        </Button>
      </div>
    </div>
  );
}
