"use client";

import {
  type CapAlertCreate,
  type CapAreaCreate,
  type CapCertainty,
  type CapMessageType,
  type CapScope,
  type CapSeverity,
  type CapStatus,
  type CapUrgency,
  createAlertApiV1CapAlertsPost,
} from "@grenmet/api-client";
import { Button } from "@grenmet/ui/components/ui/button";
import { Input } from "@grenmet/ui/components/ui/input";
import { Label } from "@grenmet/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface AreaRow {
  desc: string;
  id: string;
}

const INITIAL_FORM = {
  headline: "",
  event: "",
  msgType: "Alert",
  status: "Actual",
  scope: "Public",
  severity: "",
  urgency: "",
  certainty: "",
  language: "en",
  description: "",
  instruction: "",
  note: "",
  effective: "",
  onset: "",
  expires: "",
  senderName: "",
  contact: "",
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
      <Label className="text-gm-label text-gm-text-primary uppercase leading-gm-label">
        {label}
        {required && <span className="ml-0.5 text-gm-risk-red">*</span>}
      </Label>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-gm-heading-sm text-gm-text-primary leading-gm-heading-sm">
      {children}
    </h2>
  );
}

export default function NewAlertPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [areas, setAreas] = useState<AreaRow[]>([{ id: "1", desc: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addArea() {
    setAreas((prev) => [...prev, { id: String(prev.length + 1), desc: "" }]);
  }

  function removeArea(id: string) {
    setAreas((prev) => prev.filter((a) => a.id !== id));
  }

  function updateArea(id: string, desc: string) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, desc } : a)));
  }

  async function handleSubmit() {
    if (
      !(form.headline.trim() && form.event.trim() && form.description.trim())
    ) {
      setError("Headline, event, and description are required.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const areaPayload: CapAreaCreate[] = areas
      .filter((a) => a.desc.trim())
      .map((a) => ({ kind: "AREA", area_desc: a.desc.trim() }));

    const payload: CapAlertCreate = {
      status: form.status as CapStatus,
      msg_type: form.msgType as CapMessageType,
      scope: form.scope as CapScope,
      note: form.note.trim() || null,
      info: [
        {
          language: form.language.trim() || "en",
          event: form.event.trim(),
          headline: form.headline.trim(),
          description: form.description.trim(),
          instruction: form.instruction.trim() || null,
          ...(form.severity ? { severity: form.severity as CapSeverity } : {}),
          ...(form.urgency ? { urgency: form.urgency as CapUrgency } : {}),
          ...(form.certainty
            ? { certainty: form.certainty as CapCertainty }
            : {}),
          effective: toIsoOrNull(form.effective),
          onset: toIsoOrNull(form.onset),
          expires: toIsoOrNull(form.expires),
          sender_name: form.senderName.trim() || null,
          contact: form.contact.trim() || null,
          web: form.web.trim() || null,
          areas: areaPayload,
        },
      ],
    };

    try {
      await createAlertApiV1CapAlertsPost(payload);
      router.push("/cap");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save the alert."
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            className="inline-flex items-center gap-1.5 text-gm-body-sm text-gm-navy leading-gm-body-sm hover:underline"
            href="/cap"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Alert Dashboard
          </Link>
          <h1 className="mt-2 text-gm-heading-md text-gm-text-primary leading-gm-heading-md">
            New Alert
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
          className="mt-4 border border-gm-risk-red/40 bg-gm-risk-red/[0.06] px-4 py-3 text-gm-body-sm text-gm-risk-red leading-gm-body-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {/* Form body */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main column */}
        <div className="space-y-8">
          {/* Message block */}
          <section className="space-y-4 border border-gm-border bg-white p-6 shadow-gm-card">
            <SectionHeading>Message</SectionHeading>

            <Field label="Headline" required>
              <Input
                onChange={(e) => update("headline", e.target.value)}
                placeholder="e.g. Tropical Storm Warning for Grenada"
                value={form.headline}
              />
            </Field>

            <Field label="Event" required>
              <Input
                onChange={(e) => update("event", e.target.value)}
                placeholder="e.g. Tropical Storm"
                value={form.event}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Message type" required>
                <Select
                  onValueChange={(v) => update("msgType", v ?? "")}
                  value={form.msgType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Alert">Alert</SelectItem>
                    <SelectItem value="Update">Update</SelectItem>
                    <SelectItem value="Cancel">Cancel</SelectItem>
                    <SelectItem value="Ack">Ack</SelectItem>
                    <SelectItem value="Error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Status" required>
                <Select
                  onValueChange={(v) => update("status", v ?? "")}
                  value={form.status}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Actual">Actual</SelectItem>
                    <SelectItem value="Exercise">Exercise</SelectItem>
                    <SelectItem value="System">System</SelectItem>
                    <SelectItem value="Test">Test</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Scope" required>
                <Select
                  onValueChange={(v) => update("scope", v ?? "")}
                  value={form.scope}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Public">Public</SelectItem>
                    <SelectItem value="Restricted">Restricted</SelectItem>
                    <SelectItem value="Private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          {/* Classification */}
          <section className="space-y-4 border border-gm-border bg-white p-6 shadow-gm-card">
            <SectionHeading>Classification</SectionHeading>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Severity">
                <Select
                  onValueChange={(v) => update("severity", v ?? "")}
                  value={form.severity}
                >
                  <SelectTrigger>
                    <SelectValue>{(value) => value || "Select…"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Extreme">Extreme</SelectItem>
                    <SelectItem value="Severe">Severe</SelectItem>
                    <SelectItem value="Moderate">Moderate</SelectItem>
                    <SelectItem value="Minor">Minor</SelectItem>
                    <SelectItem value="Unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Urgency">
                <Select
                  onValueChange={(v) => update("urgency", v ?? "")}
                  value={form.urgency}
                >
                  <SelectTrigger>
                    <SelectValue>{(value) => value || "Select…"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Immediate">Immediate</SelectItem>
                    <SelectItem value="Expected">Expected</SelectItem>
                    <SelectItem value="Future">Future</SelectItem>
                    <SelectItem value="Past">Past</SelectItem>
                    <SelectItem value="Unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Certainty">
                <Select
                  onValueChange={(v) => update("certainty", v ?? "")}
                  value={form.certainty}
                >
                  <SelectTrigger>
                    <SelectValue>{(value) => value || "Select…"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Observed">Observed</SelectItem>
                    <SelectItem value="Likely">Likely</SelectItem>
                    <SelectItem value="Possible">Possible</SelectItem>
                    <SelectItem value="Unlikely">Unlikely</SelectItem>
                    <SelectItem value="Unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Language">
              <Input
                onChange={(e) => update("language", e.target.value)}
                placeholder="e.g. en"
                value={form.language}
              />
            </Field>
          </section>

          {/* Description */}
          <section className="space-y-4 border border-gm-border bg-white p-6 shadow-gm-card">
            <SectionHeading>Description</SectionHeading>

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
                placeholder="Internal note (not published)"
                value={form.note}
              />
            </Field>
          </section>

          {/* Areas */}
          <section className="space-y-4 border border-gm-border bg-white p-6 shadow-gm-card">
            <div className="flex items-center justify-between">
              <SectionHeading>Affected areas</SectionHeading>
              <Button
                onClick={addArea}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                Add area
              </Button>
            </div>

            {areas.map((area, index) => (
              <div className="flex items-center gap-2" key={area.id}>
                <Input
                  className="flex-1"
                  onChange={(e) => updateArea(area.id, e.target.value)}
                  placeholder={`Area ${index + 1} description`}
                  value={area.desc}
                />
                {areas.length > 1 && (
                  <Button
                    onClick={() => removeArea(area.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2
                      aria-hidden="true"
                      className="size-4 text-gm-text-muted"
                    />
                    <span className="sr-only">Remove area</span>
                  </Button>
                )}
              </div>
            ))}
          </section>
        </div>

        {/* Sidebar — timing & sender */}
        <div className="space-y-4">
          <div className="border border-gm-border bg-white p-4 shadow-gm-card">
            <p className="mb-4 text-gm-label text-gm-text-muted uppercase leading-gm-label">
              Timing
            </p>
            <div className="space-y-4">
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
          </div>

          <div className="border border-gm-border bg-white p-4 shadow-gm-card">
            <p className="mb-4 text-gm-label text-gm-text-muted uppercase leading-gm-label">
              Sender
            </p>
            <div className="space-y-4">
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
                  placeholder="e.g. alerts@met.gd"
                  value={form.contact}
                />
              </Field>
              <Field label="Web URL">
                <Input
                  onChange={(e) => update("web", e.target.value)}
                  placeholder="https://…"
                  type="url"
                  value={form.web}
                />
              </Field>
            </div>
          </div>
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
