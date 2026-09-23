"use client";

import {
  type CapAlertCreate,
  type CapAreaCreate,
  type CapCatalogsPublic,
  type CapCategory,
  type CapCertainty,
  type CapMessageType,
  type CapScope,
  type CapSeverity,
  type CapStatus,
  type CapUrgency,
  capCreateAlert,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { ArrowLeft, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AreaPicker } from "@/components/cap/area-picker";
import { HazardClassification } from "@/components/cap/hazard-classification";
import { LivePreview, ReadinessChecklist } from "@/components/cap/live-preview";
import { RiskLadder } from "@/components/cap/risk-ladder";
import {
  CERTAINTY_ORDER,
  SEVERITY_ORDER,
  URGENCY_ORDER,
} from "@/lib/cap-severity";

const INITIAL_FORM = {
  headline: "",
  event: "",
  msgType: "Alert",
  status: "Actual",
  scope: "Public",
  severity: "Unknown" as CapSeverity,
  urgency: "Unknown" as CapUrgency,
  certainty: "Unknown" as CapCertainty,
  language: "en",
  description: "",
  instruction: "",
  note: "",
  effective: "",
  onset: "",
  expires: "",
  senderName: "Grenada Meteorological Service",
  contact: "meteorology@gaa.gd; 1-473-444-4142",
  web: "",
};

type FormState = typeof INITIAL_FORM;

/** datetime-local (naive local) → UTC ISO string the CAP API expects, or null. */
function toIsoOrNull(local: string): string | null {
  if (!local) {
    return null;
  }
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-gm-text-primary text-label uppercase leading-label">
        {label}
        {required && <span className="ml-0.5 text-gm-risk-red">*</span>}
      </Label>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 border border-gm-border bg-card p-6 shadow-card"
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
    >
      <h2 className="text-gm-text-primary text-heading-sm leading-heading-sm">
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

export function NewAlertEditor({ catalogs }: { catalogs: CapCatalogsPublic }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [categories, setCategories] = useState<CapCategory[]>([]);
  const [areas, setAreas] = useState<CapAreaCreate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (
      !(form.headline.trim() && form.event.trim() && form.description.trim())
    ) {
      setError("Headline, event, and description are required.");
      return;
    }
    if (!categories.length) {
      setError("Select at least one CAP category.");
      return;
    }
    if (!(form.severity && form.urgency && form.certainty)) {
      setError(
        "Select severity, urgency, and certainty. Use Unknown when not assessed."
      );
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload: CapAlertCreate = {
      status: form.status as CapStatus,
      msg_type: form.msgType as CapMessageType,
      scope: form.scope as CapScope,
      note: form.note.trim() || null,
      info: [
        {
          language: form.language.trim() || "en",
          event: form.event.trim(),
          categories,
          headline: form.headline.trim(),
          description: form.description.trim(),
          instruction: form.instruction.trim() || null,
          severity: form.severity,
          urgency: form.urgency,
          certainty: form.certainty,
          effective: toIsoOrNull(form.effective),
          onset: toIsoOrNull(form.onset),
          expires: toIsoOrNull(form.expires),
          sender_name: form.senderName.trim() || null,
          contact: form.contact.trim() || null,
          web: form.web.trim() || null,
          areas,
        },
      ],
    };

    try {
      const saved = await capCreateAlert({
        body: payload,
      }).unwrap();
      router.push(`/cap/admin/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save the alert."
      );
      setSubmitting(false);
    }
  }

  const areaDesc = areas[0]?.area_desc ?? "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            className="inline-flex items-center gap-1.5 text-body-sm text-navy leading-body-sm hover:underline"
            href="/cap"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Alert Dashboard
          </Link>
          <h1 className="mt-2 text-gm-text-primary text-heading-md leading-heading-md">
            New National CAP Alert
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/cap">Cancel</Link>
          </Button>
          <Button disabled={submitting} onClick={handleSubmit} size="sm">
            <Save aria-hidden="true" />
            {submitting ? "Saving…" : "Save Draft"}
          </Button>
        </div>
      </div>

      {error ? (
        <div
          className="mt-4 border border-gm-risk-red/40 bg-gm-risk-red/[0.06] px-4 py-3 text-body-sm text-gm-risk-red leading-body-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {/* A non-Actual status must be impossible to miss while drafting: the
          public site badges these as a drill, so a status set by accident
          either suppresses a real warning or dresses a drill as a real one. */}
      <AnimatePresence initial={false}>
        {form.status === "Actual" ? null : (
          <motion.div
            animate={{ opacity: 1, height: "auto", marginTop: 16 }}
            className="overflow-hidden border-2 border-gm-risk-red bg-gm-risk-yellow px-4 py-3"
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            role="alert"
            transition={{ duration: 0.18 }}
          >
            <p className="font-bold text-body-sm text-gm-text-primary uppercase leading-body-sm">
              Status: {form.status} — this is not a live warning
            </p>
            <p className="mt-1 text-body-sm text-gm-text-primary leading-body-sm">
              The public site will label this message as a drill and tell
              readers to take no protective action. Set the status to Actual
              before issuing a real warning.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form body */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_372px]">
        {/* Main column */}
        <div className="space-y-6">
          <Section title="Message">
            <Field label="Headline" required>
              <Input
                onChange={(e) => update("headline", e.target.value)}
                placeholder="e.g. Tropical Storm Warning for Grenada"
                value={form.headline}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Message type" required>
                <Select
                  onValueChange={(v) =>
                    update("msgType", (v ?? "") as FormState["msgType"])
                  }
                  value={form.msgType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogs.message_types.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Status" required>
                <Select
                  onValueChange={(v) =>
                    update("status", (v ?? "") as FormState["status"])
                  }
                  value={form.status}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogs.statuses.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Scope" required>
                <Select
                  onValueChange={(v) =>
                    update("scope", (v ?? "") as FormState["scope"])
                  }
                  value={form.scope}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogs.scopes.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Hazard identification">
            <HazardClassification
              categories={categories}
              event={form.event}
              onCategoriesChange={setCategories}
              onEventChange={(event, nextCategories) => {
                update("event", event);
                setCategories(nextCategories);
              }}
            />
          </Section>

          <Section title="Risk assessment">
            <p className="text-body-sm text-gm-text-muted">
              Review the assessment and sender for the responsible authority.
              Unknown means not assessed; it does not mean low risk.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <RiskLadder
                colored
                label="Severity"
                onChange={(value) => update("severity", value)}
                options={SEVERITY_ORDER}
                value={form.severity}
              />
              <RiskLadder
                label="Urgency"
                onChange={(value) => update("urgency", value)}
                options={URGENCY_ORDER}
                value={form.urgency}
              />
              <RiskLadder
                label="Certainty"
                onChange={(value) => update("certainty", value)}
                options={CERTAINTY_ORDER}
                value={form.certainty}
              />
            </div>
            <Field label="Language">
              <Input
                list="cap-languages"
                onChange={(e) => update("language", e.target.value)}
                placeholder="e.g. en"
                value={form.language}
              />
              <datalist id="cap-languages">
                {catalogs.languages.map((language) => (
                  <option key={language} value={language} />
                ))}
              </datalist>
            </Field>
          </Section>

          <Section title="Affected areas">
            <p className="text-body-sm text-gm-text-muted">
              Pick the shape that matches how this hazard spreads — parishes for
              most warnings, a circle for a point source, a polygon for anything
              else.
            </p>
            <AreaPicker onAreasChange={setAreas} severity={form.severity} />
          </Section>

          <Section title="Description">
            <div className="space-y-4">
              <Field label="Description" required>
                <Textarea
                  className="min-h-28 resize-y"
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Describe the hazard and expected impact…"
                  value={form.description}
                />
              </Field>
              <Field label="Instruction">
                <Textarea
                  className="min-h-20 resize-y"
                  onChange={(e) => update("instruction", e.target.value)}
                  placeholder="Actions the public should take…"
                  value={form.instruction}
                />
              </Field>
              <Field label="Note">
                <Input
                  onChange={(e) => update("note", e.target.value)}
                  placeholder="Internal note (not published). Escalating a bulletin? Record it as: Escalated from {kind} {product ID} rev {revision}"
                  value={form.note}
                />
                <p className="text-body-sm text-gm-text-muted">
                  If this alert escalates a Hazard Bulletin or Marine Bulletin,
                  record which one here — there is no automatic link between
                  them. If you cancel this alert later and it escalated a Hazard
                  Bulletin (not a scheduled forecast or Marine Bulletin),
                  withdraw that bulletin too — it has no standing reason to stay
                  public once the hazard it flagged has been called off.
                </p>
              </Field>
            </div>
          </Section>

          <Section title="Timing & sender">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Effective">
                <Input
                  onChange={(e) => update("effective", e.target.value)}
                  type="datetime-local"
                  value={form.effective}
                />
              </Field>
              <Field label="Onset">
                <Input
                  onChange={(e) => update("onset", e.target.value)}
                  type="datetime-local"
                  value={form.onset}
                />
              </Field>
              <Field label="Expires">
                <Input
                  onChange={(e) => update("expires", e.target.value)}
                  type="datetime-local"
                  value={form.expires}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sender name">
                <Input
                  onChange={(e) => update("senderName", e.target.value)}
                  placeholder="e.g. Grenada Meteorological Service"
                  value={form.senderName}
                />
              </Field>
              <Field label="Contact">
                <Input
                  onChange={(e) => update("contact", e.target.value)}
                  placeholder="Email and telephone"
                  value={form.contact}
                />
              </Field>
            </div>
            <Field label="Web URL">
              <Input
                onChange={(e) => update("web", e.target.value)}
                placeholder="https://…"
                type="url"
                value={form.web}
              />
            </Field>
          </Section>
        </div>

        {/* Sidebar — live preview & readiness */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <LivePreview
            areaDesc={areaDesc}
            contact={form.contact}
            description={form.description}
            effective={form.effective || "Not set"}
            expires={form.expires || "Not set"}
            headline={form.headline}
            instruction={form.instruction}
            senderName={form.senderName}
            severity={form.severity}
            urgency={form.urgency}
          />
          <ReadinessChecklist
            hasArea={areas.length > 0}
            hasMessage={Boolean(
              form.headline.trim() &&
                form.event.trim() &&
                form.description.trim()
            )}
            isActualStatus={form.status === "Actual"}
            riskAssessed={
              form.severity !== "Unknown" ||
              form.urgency !== "Unknown" ||
              form.certainty !== "Unknown"
            }
          />
        </div>
      </div>

      {/* Bottom actions */}
      <div className="mt-6 flex justify-end gap-2 border-gm-border border-t pt-6">
        <Button asChild variant="outline">
          <Link href="/cap">Cancel</Link>
        </Button>
        <Button disabled={submitting} onClick={handleSubmit}>
          <Save aria-hidden="true" />
          {submitting ? "Saving…" : "Save Draft"}
        </Button>
      </div>
    </div>
  );
}
