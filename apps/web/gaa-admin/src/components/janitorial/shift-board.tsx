"use client";

import type {
  JanitorialBuilding,
  JanitorialShiftAssignment,
  JanitorialShiftPattern,
  JanitorialStaffMember,
  JanitorialZone,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Panel, PanelEmpty } from "@/app/(admin)/_components/panel";
import { dayLabel } from "@/lib/janitorial/week";
import {
  errorMessage,
  saveShiftAssignment,
  saveShiftPattern,
  saveZone,
} from "./api";
import { InactiveBadge } from "./portal";
import { ActiveCheckbox, SaveDialog } from "./save-dialog";

/** Scheduled assignments for one zone and day, earliest shift first. */
export function cellAssignments(
  assignments: JanitorialShiftAssignment[],
  patterns: JanitorialShiftPattern[],
  zoneId: number,
  day: string
): JanitorialShiftAssignment[] {
  const start = (id: number) =>
    patterns.find((pattern) => pattern.id === id)?.startsAt ?? "";
  return assignments
    .filter(
      (row) =>
        row.status === "scheduled" &&
        row.zoneId === zoneId &&
        row.workDate === day
    )
    .sort((a, b) =>
      start(a.shiftPatternId).localeCompare(start(b.shiftPatternId))
    );
}

type Editing =
  | { type: "pattern"; pattern: JanitorialShiftPattern | null }
  | { type: "zone"; zone: JanitorialZone | null }
  | { type: "assign"; zone: JanitorialZone; day: string };

export function ShiftBoard({
  assignments,
  buildings,
  canManage,
  days,
  patterns,
  siteId,
  staff,
  zones,
}: {
  assignments: JanitorialShiftAssignment[];
  buildings: JanitorialBuilding[];
  canManage: boolean;
  days: string[];
  patterns: JanitorialShiftPattern[];
  siteId: number;
  staff: JanitorialStaffMember[];
  zones: JanitorialZone[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const close = () => setEditing(null);
  const cancel = useMutation({
    mutationFn: (row: JanitorialShiftAssignment) =>
      saveShiftAssignment(row.id, {
        shiftPatternId: row.shiftPatternId,
        zoneId: row.zoneId,
        status: "cancelled",
        note: row.note ?? null,
        expectedRevision: row.revision,
      }),
  });
  const staffName = (id: string) => {
    const member = staff.find((value) => value.id === id);
    return member?.name ?? member?.email ?? "Unknown";
  };
  const patternName = (id: number) =>
    patterns.find((pattern) => pattern.id === id)?.name ?? "Shift";
  const activeZones = zones.filter((zone) => zone.active);
  const canAssign =
    canManage &&
    patterns.some((pattern) => pattern.active) &&
    staff.some((member) => member.active);

  async function onCancel(row: JanitorialShiftAssignment) {
    try {
      await cancel.mutateAsync(row);
      toast.success("Assignment cancelled");
      router.refresh();
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not cancel the assignment"));
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        description="Each cell lists who works that zone on each shift."
        title="Week roster"
      >
        {activeZones.length === 0 ? (
          <PanelEmpty>Add a zone below to start the roster.</PanelEmpty>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[56rem] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Zone</TableHead>
                  {days.map((day) => (
                    <TableHead key={day}>{dayLabel(day)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeZones.map((zone) => (
                  <TableRow key={zone.id}>
                    <TableCell className="whitespace-normal align-top font-medium">
                      {zone.name}
                      <span className="block text-muted-foreground text-xs">
                        {zone.areaIds.length} areas
                      </span>
                    </TableCell>
                    {days.map((day) => (
                      <TableCell
                        className="whitespace-normal align-top"
                        key={day}
                      >
                        <ul className="space-y-1">
                          {cellAssignments(
                            assignments,
                            patterns,
                            zone.id,
                            day
                          ).map((row) => (
                            <li key={row.id}>
                              <Badge
                                className="h-auto max-w-full justify-between gap-1 whitespace-normal py-0.5 pr-0.5 text-left"
                                title={row.note ?? undefined}
                                variant="light-light"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate">
                                    {staffName(row.staffId)}
                                  </span>
                                  <span className="block text-muted-foreground">
                                    {patternName(row.shiftPatternId)}
                                  </span>
                                </span>
                                {canManage ? (
                                  <button
                                    aria-label={`Cancel ${staffName(row.staffId)}, ${patternName(row.shiftPatternId)}, ${dayLabel(day)}`}
                                    className="shrink-0 rounded-full p-0.5 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                                    disabled={cancel.isPending}
                                    onClick={() => onCancel(row)}
                                    type="button"
                                  >
                                    <X aria-hidden="true" className="size-3" />
                                  </button>
                                ) : null}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                        {canAssign ? (
                          <Button
                            aria-label={`Assign to ${zone.name} on ${dayLabel(day)}`}
                            className="mt-1"
                            onClick={() =>
                              setEditing({ type: "assign", zone, day })
                            }
                            size="icon-xs"
                            variant="ghost"
                          >
                            <Plus />
                          </Button>
                        ) : null}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel description="Named shifts at this airport." title="Shifts">
          {patterns.length === 0 ? (
            <PanelEmpty>No shifts yet.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {patterns.map((pattern) => (
                <li
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                  key={pattern.id}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{pattern.name}</span>
                    <span className="font-mono text-muted-foreground text-xs">
                      {pattern.startsAt}–{pattern.endsAt}
                      {pattern.endsAt < pattern.startsAt ? " (+1)" : ""}
                    </span>
                    <InactiveBadge active={pattern.active} />
                  </span>
                  {canManage ? (
                    <Button
                      aria-label={`Edit ${pattern.name}`}
                      onClick={() => setEditing({ type: "pattern", pattern })}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canManage ? (
            <Button
              className="mt-3"
              onClick={() => setEditing({ type: "pattern", pattern: null })}
              size="sm"
              variant="outline"
            >
              <Plus data-icon="inline-start" />
              Add shift
            </Button>
          ) : null}
        </Panel>

        <Panel
          description="Groups of areas staff are assigned to."
          title="Zones"
        >
          {zones.length === 0 ? (
            <PanelEmpty>No zones yet.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {zones.map((zone) => (
                <li
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                  key={zone.id}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{zone.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {zone.areaIds.length} areas
                    </span>
                    <InactiveBadge active={zone.active} />
                  </span>
                  {canManage ? (
                    <Button
                      aria-label={`Edit ${zone.name}`}
                      onClick={() => setEditing({ type: "zone", zone })}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canManage ? (
            <Button
              className="mt-3"
              onClick={() => setEditing({ type: "zone", zone: null })}
              size="sm"
              variant="outline"
            >
              <Plus data-icon="inline-start" />
              Add zone
            </Button>
          ) : null}
        </Panel>
      </div>

      {editing?.type === "pattern" ? (
        <PatternDialog
          onClose={close}
          pattern={editing.pattern}
          siteId={siteId}
        />
      ) : null}
      {editing?.type === "zone" ? (
        <ZoneDialog
          buildings={buildings}
          onClose={close}
          siteId={siteId}
          zone={editing.zone}
        />
      ) : null}
      {editing?.type === "assign" ? (
        <AssignDialog
          day={editing.day}
          onClose={close}
          patterns={patterns.filter((pattern) => pattern.active)}
          staff={staff.filter((member) => member.active)}
          zone={editing.zone}
        />
      ) : null}
    </div>
  );
}

function PatternDialog({
  onClose,
  pattern,
  siteId,
}: {
  onClose: () => void;
  pattern: JanitorialShiftPattern | null;
  siteId: number;
}) {
  const id = useId();
  const [form, setForm] = useState({
    name: pattern?.name ?? "",
    startsAt: pattern?.startsAt ?? "06:00",
    endsAt: pattern?.endsAt ?? "14:00",
    active: pattern?.active ?? true,
  });
  const save = () =>
    pattern
      ? saveShiftPattern(pattern.id, {
          name: form.name.trim(),
          startsAt: form.startsAt,
          endsAt: form.endsAt,
          active: form.active,
          expectedRevision: pattern.revision,
        })
      : saveShiftPattern(null, {
          siteId,
          name: form.name.trim(),
          startsAt: form.startsAt,
          endsAt: form.endsAt,
        });

  return (
    <SaveDialog
      description="A shift that ends before it starts runs past midnight."
      onClose={onClose}
      save={save}
      submitLabel="Save shift"
      success="Shift saved"
      title={pattern ? "Edit shift" : "Add shift"}
    >
      <Field className="w-60">
        <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
        <Input
          id={`${id}-name`}
          maxLength={100}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Morning"
          required
          value={form.name}
        />
      </Field>
      <div className="flex gap-3">
        <Field className="w-32">
          <FieldLabel htmlFor={`${id}-start`}>Starts</FieldLabel>
          <Input
            id={`${id}-start`}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            required
            type="time"
            value={form.startsAt}
          />
        </Field>
        <Field className="w-32">
          <FieldLabel htmlFor={`${id}-end`}>Ends</FieldLabel>
          <Input
            id={`${id}-end`}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            required
            type="time"
            value={form.endsAt}
          />
        </Field>
      </div>
      {pattern ? (
        <ActiveCheckbox
          checked={form.active}
          id={`${id}-active`}
          onChange={(active) => setForm({ ...form, active })}
        />
      ) : null}
    </SaveDialog>
  );
}

function ZoneDialog({
  buildings,
  onClose,
  siteId,
  zone,
}: {
  buildings: JanitorialBuilding[];
  onClose: () => void;
  siteId: number;
  zone: JanitorialZone | null;
}) {
  const id = useId();
  const [name, setName] = useState(zone?.name ?? "");
  const [active, setActive] = useState(zone?.active ?? true);
  const [areaIds, setAreaIds] = useState<Set<number>>(
    new Set(zone?.areaIds ?? [])
  );
  const toggle = (areaId: number, on: boolean) => {
    const next = new Set(areaIds);
    if (on) next.add(areaId);
    else next.delete(areaId);
    setAreaIds(next);
  };
  const ids = [...areaIds].sort((a, b) => a - b);
  const save = () =>
    zone
      ? saveZone(zone.id, {
          name: name.trim(),
          areaIds: ids,
          active,
          expectedRevision: zone.revision,
        })
      : saveZone(null, { siteId, name: name.trim(), areaIds: ids });

  return (
    <SaveDialog
      description="A zone groups the areas one person covers on a shift."
      onClose={onClose}
      save={save}
      submitLabel="Save zone"
      success="Zone saved"
      title={zone ? "Edit zone" : "Add zone"}
    >
      <Field className="w-72">
        <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
        <Input
          id={`${id}-name`}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Departures restrooms"
          required
          value={name}
        />
      </Field>
      <fieldset className="space-y-2">
        <legend className="font-medium text-sm">
          Areas <span className="text-muted-foreground">({areaIds.size})</span>
        </legend>
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border p-3">
          {buildings
            .filter((building) => building.active)
            .map((building) => (
              <div className="space-y-1" key={building.id}>
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {building.name}
                </p>
                {building.areas
                  .filter((area) => area.active || areaIds.has(area.id))
                  .map((area) => (
                    <label
                      className="flex items-center gap-2 text-sm"
                      htmlFor={`${id}-a${area.id}`}
                      key={area.id}
                    >
                      <Checkbox
                        checked={areaIds.has(area.id)}
                        id={`${id}-a${area.id}`}
                        onCheckedChange={(value) =>
                          toggle(area.id, Boolean(value))
                        }
                      />
                      {area.name}
                      <span className="font-mono text-muted-foreground text-xs">
                        {area.code}
                      </span>
                    </label>
                  ))}
              </div>
            ))}
        </div>
      </fieldset>
      {zone ? (
        <ActiveCheckbox
          checked={active}
          id={`${id}-active`}
          onChange={setActive}
        />
      ) : null}
    </SaveDialog>
  );
}

function AssignDialog({
  day,
  onClose,
  patterns,
  staff,
  zone,
}: {
  day: string;
  onClose: () => void;
  patterns: JanitorialShiftPattern[];
  staff: JanitorialStaffMember[];
  zone: JanitorialZone;
}) {
  const id = useId();
  const [form, setForm] = useState({
    staffId: staff[0]?.id ?? "",
    shiftPatternId: String(patterns[0]?.id ?? ""),
    note: "",
  });

  return (
    <SaveDialog
      description={`${zone.name} · ${dayLabel(day)}`}
      onClose={onClose}
      save={() =>
        saveShiftAssignment(null, {
          workDate: day,
          shiftPatternId: Number(form.shiftPatternId),
          staffId: form.staffId,
          zoneId: zone.id,
          note: form.note.trim() || null,
        })
      }
      submitLabel="Assign"
      success="Assigned"
      title="Assign staff"
    >
      <div className="flex flex-wrap gap-3">
        <Field className="w-64">
          <FieldLabel htmlFor={`${id}-staff`}>Staff member</FieldLabel>
          <NativeSelect
            id={`${id}-staff`}
            onChange={(e) => setForm({ ...form, staffId: e.target.value })}
            value={form.staffId}
          >
            {staff.map((member) => (
              <NativeSelectOption key={member.id} value={member.id}>
                {member.name ?? member.email}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-48">
          <FieldLabel htmlFor={`${id}-shift`}>Shift</FieldLabel>
          <NativeSelect
            id={`${id}-shift`}
            onChange={(e) =>
              setForm({ ...form, shiftPatternId: e.target.value })
            }
            value={form.shiftPatternId}
          >
            {patterns.map((pattern) => (
              <NativeSelectOption key={pattern.id} value={String(pattern.id)}>
                {pattern.name} ({pattern.startsAt}–{pattern.endsAt})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-note`}>Note (optional)</FieldLabel>
        <Input
          id={`${id}-note`}
          maxLength={4000}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          value={form.note}
        />
      </Field>
    </SaveDialog>
  );
}
