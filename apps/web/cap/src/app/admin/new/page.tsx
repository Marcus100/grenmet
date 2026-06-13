"use client";

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
import { useState } from "react";

interface AreaRow {
  desc: string;
  id: string;
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
  const [areas, setAreas] = useState<AreaRow[]>([{ id: "1", desc: "" }]);

  function addArea() {
    setAreas((prev) => [...prev, { id: String(Date.now()), desc: "" }]);
  }

  function removeArea(id: string) {
    setAreas((prev) => prev.filter((a) => a.id !== id));
  }

  function updateArea(id: string, desc: string) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, desc } : a)));
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            className="inline-flex items-center gap-1.5 text-gm-body-sm text-gm-navy leading-gm-body-sm hover:underline"
            href="/admin"
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
            <Link href="/admin">Cancel</Link>
          </Button>
          <Button size="sm">
            <Save aria-hidden="true" />
            Save Draft
          </Button>
        </div>
      </div>

      {/* Form body */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main column */}
        <div className="space-y-8">
          {/* Message block */}
          <section className="space-y-4 border border-gm-border bg-white p-6 shadow-gm-card">
            <SectionHeading>Message</SectionHeading>

            <Field label="Headline" required>
              <Input placeholder="e.g. Tropical Storm Warning for Grenada" />
            </Field>

            <Field label="Event" required>
              <Input placeholder="e.g. Tropical Storm" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Message type" required>
                <Select defaultValue="Alert">
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
                <Select defaultValue="Actual">
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
                <Select defaultValue="Public">
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
              <Field label="Severity" required>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
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

              <Field label="Urgency" required>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
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

              <Field label="Certainty" required>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
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
              <Input defaultValue="en" placeholder="e.g. en" />
            </Field>
          </section>

          {/* Description */}
          <section className="space-y-4 border border-gm-border bg-white p-6 shadow-gm-card">
            <SectionHeading>Description</SectionHeading>

            <Field label="Description" required>
              <Textarea
                className="min-h-28 resize-y"
                placeholder="Describe the hazard and expected impact…"
              />
            </Field>

            <Field label="Instruction">
              <Textarea
                className="min-h-20 resize-y"
                placeholder="Actions the public should take…"
              />
            </Field>

            <Field label="Note">
              <Input placeholder="Internal note (not published)" />
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
                <Input type="datetime-local" />
              </Field>
              <Field label="Onset">
                <Input type="datetime-local" />
              </Field>
              <Field label="Expires">
                <Input type="datetime-local" />
              </Field>
            </div>
          </div>

          <div className="border border-gm-border bg-white p-4 shadow-gm-card">
            <p className="mb-4 text-gm-label text-gm-text-muted uppercase leading-gm-label">
              Sender
            </p>
            <div className="space-y-4">
              <Field label="Sender name">
                <Input placeholder="e.g. Grenada Meteorological Service" />
              </Field>
              <Field label="Contact">
                <Input placeholder="e.g. alerts@met.gd" />
              </Field>
              <Field label="Web URL">
                <Input placeholder="https://…" type="url" />
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="mt-6 flex justify-end gap-2 border-gm-border border-t pt-6">
        <Button asChild variant="outline">
          <Link href="/admin">Cancel</Link>
        </Button>
        <Button>
          <Save aria-hidden="true" />
          Save Draft
        </Button>
      </div>
    </div>
  );
}
