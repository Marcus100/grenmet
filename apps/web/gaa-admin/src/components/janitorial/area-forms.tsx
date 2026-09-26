"use client";

import type {
  JanitorialArea,
  JanitorialSection,
  JanitorialTask,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Pencil, Plus } from "lucide-react";
import { useId, useState } from "react";
import {
  APPA_LEVEL_LABELS,
  SPACE_TYPE_LABELS,
  type SpaceType,
} from "@/lib/janitorial/catalogue";
import { saveArea, saveTask } from "./api";
import { ActiveCheckbox, SaveDialog } from "./save-dialog";

// --- Area ------------------------------------------------------------------

interface AreaForm {
  active: boolean;
  cleanlinessLevel: string;
  name: string;
  quantity: string;
  sectionId: string;
  spaceType: SpaceType;
}

export function toAreaUpdate(form: AreaForm, revision: number) {
  return {
    sectionId: form.sectionId ? Number(form.sectionId) : null,
    name: form.name.trim(),
    spaceType: form.spaceType,
    cleanlinessLevel: form.cleanlinessLevel
      ? Number(form.cleanlinessLevel)
      : null,
    quantity: Number(form.quantity),
    active: form.active,
    expectedRevision: revision,
  };
}

export function AreaEditButton({
  area,
  sections,
}: {
  area: JanitorialArea;
  sections: JanitorialSection[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline">
        <Pencil data-icon="inline-start" />
        Edit area
      </Button>
      {open ? (
        <AreaDialog
          area={area}
          onClose={() => setOpen(false)}
          sections={sections}
        />
      ) : null}
    </>
  );
}

function AreaDialog({
  area,
  onClose,
  sections,
}: {
  area: JanitorialArea;
  onClose: () => void;
  sections: JanitorialSection[];
}) {
  const id = useId();
  const [form, setForm] = useState<AreaForm>({
    active: area.active,
    cleanlinessLevel:
      area.cleanlinessLevel == null ? "" : String(area.cleanlinessLevel),
    name: area.name,
    quantity: String(area.quantity),
    sectionId: area.sectionId == null ? "" : String(area.sectionId),
    spaceType: area.spaceType,
  });

  return (
    <SaveDialog
      description={`Code ${area.code} stays the same, so printed labels keep working.`}
      onClose={onClose}
      save={() => saveArea(area.id, toAreaUpdate(form, area.revision))}
      submitLabel="Save area"
      success="Area saved"
      title="Edit area"
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
            {sections.map((section) => (
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
            onChange={(e) =>
              setForm({ ...form, spaceType: e.target.value as SpaceType })
            }
            value={form.spaceType}
          >
            {Object.entries(SPACE_TYPE_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
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
      </div>
      <ActiveCheckbox
        checked={form.active}
        id={`${id}-active`}
        onChange={(active) => setForm({ ...form, active })}
      />
    </SaveDialog>
  );
}

// --- Tasks -----------------------------------------------------------------

interface TaskForm {
  active: boolean;
  activity: string;
  count: string;
  mode: string;
  periodUnit: "minute" | "day";
  periodValue: string;
}

export function toTaskInput(form: TaskForm) {
  return {
    activity: form.activity.trim(),
    frequency: {
      count: Number(form.count),
      periodValue: Number(form.periodValue),
      periodUnit: form.periodUnit,
    },
    mode: form.mode.trim() || null,
  };
}

export function TaskButton({
  areaId,
  task,
}: {
  areaId: number;
  task: JanitorialTask | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {task ? (
        <Button
          aria-label={`Edit ${task.activity}`}
          onClick={() => setOpen(true)}
          size="icon-sm"
          variant="ghost"
        >
          <Pencil />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} size="sm" variant="outline">
          <Plus data-icon="inline-start" />
          Add task
        </Button>
      )}
      {open ? (
        <TaskDialog
          areaId={areaId}
          onClose={() => setOpen(false)}
          task={task}
        />
      ) : null}
    </>
  );
}

function TaskDialog({
  areaId,
  onClose,
  task,
}: {
  areaId: number;
  onClose: () => void;
  task: JanitorialTask | null;
}) {
  const id = useId();
  const [form, setForm] = useState<TaskForm>({
    active: task?.active ?? true,
    activity: task?.activity ?? "",
    count: String(task?.frequency.count ?? 1),
    mode: task?.mode ?? "",
    periodUnit: task?.frequency.periodUnit ?? "day",
    periodValue: String(task?.frequency.periodValue ?? 1),
  });
  const save = () =>
    task
      ? saveTask(areaId, task.id, {
          ...toTaskInput(form),
          active: form.active,
          expectedRevision: task.revision,
        })
      : saveTask(areaId, null, toTaskInput(form));

  return (
    <SaveDialog
      description="Activities with the same name are shared across areas."
      onClose={onClose}
      save={save}
      submitLabel="Save task"
      success="Task saved"
      title={task ? "Edit task" : "Add task"}
    >
      <Field>
        <FieldLabel htmlFor={`${id}-activity`}>Activity</FieldLabel>
        <Input
          id={`${id}-activity`}
          maxLength={200}
          onChange={(e) => setForm({ ...form, activity: e.target.value })}
          placeholder="e.g. Clean mirrors"
          required
          value={form.activity}
        />
      </Field>
      <fieldset className="space-y-2">
        <legend className="font-medium text-sm">Frequency</legend>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input
            aria-label="Times"
            className="w-20"
            inputMode="numeric"
            max={1440}
            min={1}
            onChange={(e) => setForm({ ...form, count: e.target.value })}
            required
            type="number"
            value={form.count}
          />
          <span>× every</span>
          <Input
            aria-label="Period length"
            className="w-20"
            inputMode="numeric"
            max={3650}
            min={1}
            onChange={(e) => setForm({ ...form, periodValue: e.target.value })}
            required
            type="number"
            value={form.periodValue}
          />
          <NativeSelect
            aria-label="Period unit"
            onChange={(e) =>
              setForm({
                ...form,
                periodUnit: e.target.value as TaskForm["periodUnit"],
              })
            }
            value={form.periodUnit}
          >
            <NativeSelectOption value="minute">minutes</NativeSelectOption>
            <NativeSelectOption value="day">days</NativeSelectOption>
          </NativeSelect>
        </div>
      </fieldset>
      <Field className="w-44">
        <FieldLabel htmlFor={`${id}-mode`}>Mode (optional)</FieldLabel>
        <Input
          id={`${id}-mode`}
          maxLength={40}
          onChange={(e) => setForm({ ...form, mode: e.target.value })}
          placeholder="e.g. light, deep"
          value={form.mode}
        />
      </Field>
      {task ? (
        <ActiveCheckbox
          checked={form.active}
          id={`${id}-active`}
          onChange={(active) => setForm({ ...form, active })}
        />
      ) : null}
    </SaveDialog>
  );
}
