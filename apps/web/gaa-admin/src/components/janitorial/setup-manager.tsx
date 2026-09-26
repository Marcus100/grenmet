"use client";

import type {
  JanitorialBuilding,
  JanitorialSection,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Card } from "@barrelsgd/ui/components/ui/card";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import {
  APPA_LEVEL_LABELS,
  SPACE_TYPE_LABELS,
} from "@/lib/janitorial/catalogue";
import { saveArea, saveBuilding, saveSection } from "./api";
import { InactiveBadge } from "./portal";
import { ActiveCheckbox, SaveDialog } from "./save-dialog";

type Kind = JanitorialBuilding["kind"];

const KIND_LABELS: Record<Kind, string> = {
  terminal: "Terminal",
  auxiliary: "Auxiliary",
  other: "Other",
};

type Editing =
  | { type: "building"; building: JanitorialBuilding | null }
  | {
      type: "section";
      buildingId: number;
      section: JanitorialSection | null;
    }
  | { type: "area"; building: JanitorialBuilding };

export function SetupManager({
  buildings,
  canAddBuildings,
  siteCode,
  siteId,
  siteName,
}: {
  buildings: JanitorialBuilding[];
  canAddBuildings: boolean;
  siteCode: string;
  siteId: number;
  siteName: string;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const close = () => setEditing(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {buildings.length} buildings at {siteName}. Areas get a printable code
          when they are added; edit an area's details from its page.
        </p>
        {canAddBuildings ? (
          <Button
            onClick={() => setEditing({ type: "building", building: null })}
            variant="outline"
          >
            <Plus data-icon="inline-start" />
            Add building
          </Button>
        ) : null}
      </div>

      {buildings.length === 0 ? (
        <Card className="px-4 py-8 text-center text-muted-foreground text-sm">
          No buildings yet.
          {canAddBuildings
            ? " Add the first building to start this site's spec."
            : ""}
        </Card>
      ) : null}

      {buildings.map((building) => (
        <Card className="gap-3 px-4 py-4" key={building.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <h2 className="flex flex-wrap items-center gap-2 font-medium">
                {building.name}
                <Badge variant="light-light">
                  {KIND_LABELS[building.kind]}
                </Badge>
                <InactiveBadge active={building.active} />
              </h2>
              <p className="text-muted-foreground text-xs">
                {building.areas.filter((area) => area.active).length} active
                areas · {building.sections.length} sections ·{" "}
                <Link
                  className="text-primary hover:underline"
                  href={`/janitor/areas?site=${siteCode}&building=${building.id}`}
                >
                  View areas
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setEditing({ type: "area", building })}
                size="sm"
                variant="outline"
              >
                <Plus data-icon="inline-start" />
                Add area
              </Button>
              <Button
                onClick={() =>
                  setEditing({
                    type: "section",
                    buildingId: building.id,
                    section: null,
                  })
                }
                size="sm"
                variant="outline"
              >
                <Plus data-icon="inline-start" />
                Add section
              </Button>
              <Button
                aria-label={`Edit ${building.name}`}
                onClick={() => setEditing({ type: "building", building })}
                size="icon-sm"
                variant="ghost"
              >
                <Pencil />
              </Button>
            </div>
          </div>
          {building.sections.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border">
              {building.sections.map((section) => (
                <li
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  key={section.id}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      {section.name}
                      <InactiveBadge active={section.active} />
                    </span>
                    {section.note ? (
                      <span className="block text-muted-foreground text-xs">
                        {section.note}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    aria-label={`Edit ${section.name}`}
                    onClick={() =>
                      setEditing({
                        type: "section",
                        buildingId: building.id,
                        section,
                      })
                    }
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Pencil />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ))}

      {editing?.type === "building" ? (
        <BuildingDialog
          building={editing.building}
          onClose={close}
          siteId={siteId}
        />
      ) : null}
      {editing?.type === "section" ? (
        <SectionDialog
          buildingId={editing.buildingId}
          onClose={close}
          section={editing.section}
        />
      ) : null}
      {editing?.type === "area" ? (
        <NewAreaDialog building={editing.building} onClose={close} />
      ) : null}
    </div>
  );
}

function BuildingDialog({
  building,
  onClose,
  siteId,
}: {
  building: JanitorialBuilding | null;
  onClose: () => void;
  siteId: number;
}) {
  const id = useId();
  const [name, setName] = useState(building?.name ?? "");
  const [kind, setKind] = useState<Kind>(building?.kind ?? "other");
  const [active, setActive] = useState(building?.active ?? true);
  const save = () =>
    building
      ? saveBuilding(building.id, {
          name: name.trim(),
          kind,
          active,
          expectedRevision: building.revision,
        })
      : saveBuilding(null, { siteId, name: name.trim(), kind });

  return (
    <SaveDialog
      onClose={onClose}
      save={save}
      submitLabel="Save building"
      success="Building saved"
      title={building ? "Edit building" : "Add building"}
    >
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
        <Input
          id={`${id}-name`}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          required
          value={name}
        />
      </Field>
      <Field className="w-44">
        <FieldLabel htmlFor={`${id}-kind`}>Kind</FieldLabel>
        <NativeSelect
          id={`${id}-kind`}
          onChange={(e) => setKind(e.target.value as Kind)}
          value={kind}
        >
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {building ? (
        <ActiveCheckbox
          checked={active}
          id={`${id}-active`}
          onChange={setActive}
        />
      ) : null}
    </SaveDialog>
  );
}

function SectionDialog({
  buildingId,
  onClose,
  section,
}: {
  buildingId: number;
  onClose: () => void;
  section: JanitorialSection | null;
}) {
  const id = useId();
  const [name, setName] = useState(section?.name ?? "");
  const [note, setNote] = useState(section?.note ?? "");
  const [active, setActive] = useState(section?.active ?? true);
  const save = () =>
    section
      ? saveSection(section.id, {
          name: name.trim(),
          note: note.trim() || null,
          active,
          expectedRevision: section.revision,
        })
      : saveSection(null, {
          buildingId,
          name: name.trim(),
          note: note.trim() || null,
        });

  return (
    <SaveDialog
      onClose={onClose}
      save={save}
      submitLabel="Save section"
      success="Section saved"
      title={section ? "Edit section" : "Add section"}
    >
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
        <Input
          id={`${id}-name`}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          required
          value={name}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-note`}>Note (optional)</FieldLabel>
        <Textarea
          id={`${id}-note`}
          maxLength={4000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Tidy up after heavy flights"
          rows={2}
          value={note}
        />
      </Field>
      {section ? (
        <ActiveCheckbox
          checked={active}
          id={`${id}-active`}
          onChange={setActive}
        />
      ) : null}
    </SaveDialog>
  );
}

/** Form state → create body; an empty space type lets the API infer it. */
export function toAreaCreate(
  buildingId: number,
  form: {
    cleanlinessLevel: string;
    name: string;
    quantity: string;
    sectionId: string;
    spaceType: string;
  }
) {
  return {
    buildingId,
    sectionId: form.sectionId ? Number(form.sectionId) : null,
    name: form.name.trim(),
    spaceType: form.spaceType || null,
    cleanlinessLevel:
      form.spaceType && form.cleanlinessLevel
        ? Number(form.cleanlinessLevel)
        : null,
    quantity: Number(form.quantity),
  };
}

function NewAreaDialog({
  building,
  onClose,
}: {
  building: JanitorialBuilding;
  onClose: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState({
    cleanlinessLevel: "",
    name: "",
    quantity: "1",
    sectionId: "",
    spaceType: "",
  });

  return (
    <SaveDialog
      description={`Adds an area to ${building.name}. Add its tasks from the area's page.`}
      onClose={onClose}
      save={() => saveArea(null, toAreaCreate(building.id, form))}
      submitLabel="Add area"
      success="Area added"
      title="Add area"
    >
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
        <Input
          id={`${id}-name`}
          maxLength={200}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          value={form.name}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field className="w-56">
          <FieldLabel htmlFor={`${id}-section`}>Section</FieldLabel>
          <NativeSelect
            id={`${id}-section`}
            onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
            value={form.sectionId}
          >
            <NativeSelectOption value="">No section</NativeSelectOption>
            {building.sections
              .filter((section) => section.active)
              .map((section) => (
                <NativeSelectOption key={section.id} value={String(section.id)}>
                  {section.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
        <Field className="w-24">
          <FieldLabel htmlFor={`${id}-quantity`}>Quantity</FieldLabel>
          <Input
            id={`${id}-quantity`}
            inputMode="numeric"
            max={1000}
            min={1}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            required
            type="number"
            value={form.quantity}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Field className="w-44">
          <FieldLabel htmlFor={`${id}-space`}>Space type</FieldLabel>
          <NativeSelect
            id={`${id}-space`}
            onChange={(e) => setForm({ ...form, spaceType: e.target.value })}
            value={form.spaceType}
          >
            <NativeSelectOption value="">Infer from name</NativeSelectOption>
            {Object.entries(SPACE_TYPE_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {form.spaceType ? (
          <Field className="w-60">
            <FieldLabel htmlFor={`${id}-level`}>Target APPA level</FieldLabel>
            <NativeSelect
              id={`${id}-level`}
              onChange={(e) =>
                setForm({ ...form, cleanlinessLevel: e.target.value })
              }
              value={form.cleanlinessLevel}
            >
              <NativeSelectOption value="">Not set</NativeSelectOption>
              {Object.entries(APPA_LEVEL_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {value} — {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </div>
    </SaveDialog>
  );
}
