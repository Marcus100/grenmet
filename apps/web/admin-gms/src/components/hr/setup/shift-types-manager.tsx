"use client";

import {
  listShiftCatalogApiV1HrRostersShiftsGetQueryKey,
  type ShiftCatalogPublic,
  useCreateShiftApiV1HrRostersShiftsPost,
  useListShiftCatalogApiV1HrRostersShiftsGet,
  useUpdateShiftApiV1HrRostersShiftsCodePatch,
} from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Button } from "@grenmet/ui/components/ui/button";
import { Checkbox } from "@grenmet/ui/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@grenmet/ui/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@grenmet/ui/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import { NativeSelect } from "@grenmet/ui/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@grenmet/ui/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Category = "WORK" | "OFF" | "LEAVE" | "HOLIDAY";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "WORK", label: "Work" },
  { value: "OFF", label: "Off" },
  { value: "LEAVE", label: "Leave" },
  { value: "HOLIDAY", label: "Holiday" },
];

interface ShiftForm {
  category: Category;
  code: string;
  counts_as_work_hours: boolean;
  end_time: string;
  ends_next_day: boolean;
  label: string;
  needs_approval: boolean;
  needs_reason: boolean;
  start_time: string;
}

// Category-derived defaults for the advanced flags — mirrors the API so the
// form shows the same values the backend would apply.
function deriveFlags(category: Category) {
  const isWork = category === "WORK";
  const isLeave = category === "LEAVE";
  return {
    counts_as_work_hours: isWork,
    needs_reason: isLeave,
    needs_approval: isLeave,
  };
}

function emptyForm(): ShiftForm {
  return {
    code: "",
    label: "",
    category: "WORK",
    start_time: "",
    end_time: "",
    ends_next_day: false,
    ...deriveFlags("WORK"),
  };
}

function formFromShift(shift: ShiftCatalogPublic): ShiftForm {
  return {
    code: shift.code,
    label: shift.label,
    category: shift.category as Category,
    start_time: shift.start_time ?? "",
    end_time: shift.end_time ?? "",
    ends_next_day: shift.ends_next_day,
    counts_as_work_hours: shift.counts_as_work_hours,
    needs_reason: shift.needs_reason,
    needs_approval: shift.needs_approval,
  };
}

function ShiftTypeDialog({
  existing,
  trigger,
}: {
  existing?: ShiftCatalogPublic;
  trigger: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState<ShiftForm>(() =>
    existing ? formFromShift(existing) : emptyForm()
  );

  const createMutation = useCreateShiftApiV1HrRostersShiftsPost();
  const updateMutation = useUpdateShiftApiV1HrRostersShiftsCodePatch();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const isEdit = Boolean(existing);

  function set<K extends keyof ShiftForm>(key: K, value: ShiftForm[K]) {
    setForm((cur) => ({ ...cur, [key]: value }));
  }

  // Changing category re-derives the advanced flags (an override is set after).
  function setCategory(category: Category) {
    setForm((cur) => ({ ...cur, category, ...deriveFlags(category) }));
  }

  function reset() {
    setForm(existing ? formFromShift(existing) : emptyForm());
    setShowAdvanced(false);
  }

  const canSubmit = form.code.trim() && form.label.trim();

  let submitLabel = "Create";
  if (isEdit) {
    submitLabel = "Save changes";
  }
  if (isPending) {
    submitLabel = "Saving…";
  }

  async function submit() {
    if (!canSubmit) {
      return;
    }
    const body = {
      label: form.label.trim(),
      category: form.category,
      start_time: form.start_time.trim() || null,
      end_time: form.end_time.trim() || null,
      ends_next_day: form.ends_next_day,
      counts_as_work_hours: form.counts_as_work_hours,
      needs_reason: form.needs_reason,
      needs_approval: form.needs_approval,
    };
    try {
      if (existing) {
        await updateMutation.mutateAsync({ code: existing.code, data: body });
      } else {
        await createMutation.mutateAsync({
          data: { ...body, code: form.code.trim() },
        });
      }
      await queryClient.invalidateQueries({
        queryKey: listShiftCatalogApiV1HrRostersShiftsGetQueryKey(),
      });
      toast.success(
        isEdit ? `Updated shift "${form.code}"` : `Created shift "${form.code}"`
      );
      setOpen(false);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Could not save shift type: ${detail}`);
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit shift type ${existing?.code}` : "New shift type"}
          </DialogTitle>
          <DialogDescription>
            Shift types are the building blocks a roster is assigned from.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="st-code">Code</FieldLabel>
              <Input
                disabled={isEdit}
                id="st-code"
                maxLength={10}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="M"
                value={form.code}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="st-label">Label</FieldLabel>
              <Input
                id="st-label"
                maxLength={120}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Morning"
                value={form.label}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="st-category">Category</FieldLabel>
              <NativeSelect
                id="st-category"
                onChange={(e) => setCategory(e.target.value as Category)}
                value={form.category}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="st-start">Start</FieldLabel>
              <Input
                id="st-start"
                onChange={(e) => set("start_time", e.target.value)}
                placeholder="05:30"
                value={form.start_time}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="st-end">End</FieldLabel>
              <Input
                id="st-end"
                onChange={(e) => set("end_time", e.target.value)}
                placeholder="14:00"
                value={form.end_time}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm" htmlFor="st-next">
            <Checkbox
              checked={form.ends_next_day}
              id="st-next"
              onCheckedChange={(v) => set("ends_next_day", !!v)}
            />
            Ends the next day (e.g. a night shift)
          </label>

          <Collapsible onOpenChange={setShowAdvanced} open={showAdvanced}>
            <CollapsibleTrigger
              render={
                <Button
                  className="w-full justify-between"
                  size="sm"
                  type="button"
                  variant="ghost"
                />
              }
            >
              Advanced (auto-set from category)
              <ChevronsUpDown className="size-3.5" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <label
                className="flex items-center gap-2 text-sm"
                htmlFor="st-hours"
              >
                <Checkbox
                  checked={form.counts_as_work_hours}
                  id="st-hours"
                  onCheckedChange={(v) => set("counts_as_work_hours", !!v)}
                />
                Counts as work hours
              </label>
              <label
                className="flex items-center gap-2 text-sm"
                htmlFor="st-reason"
              >
                <Checkbox
                  checked={form.needs_reason}
                  id="st-reason"
                  onCheckedChange={(v) => set("needs_reason", !!v)}
                />
                Requires a reason when assigned
              </label>
              <label
                className="flex items-center gap-2 text-sm"
                htmlFor="st-approval"
              >
                <Checkbox
                  checked={form.needs_approval}
                  id="st-approval"
                  onCheckedChange={(v) => set("needs_approval", !!v)}
                />
                Requires approval
              </label>
            </CollapsibleContent>
          </Collapsible>
        </FieldGroup>
        <DialogFooter>
          <Button
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || isPending}
            onClick={submit}
            type="button"
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShiftTypesManager() {
  const queryClient = useQueryClient();
  const shiftsQuery = useListShiftCatalogApiV1HrRostersShiftsGet({
    include_inactive: true,
  });
  const shifts = shiftsQuery.data?.data ?? [];
  const updateMutation = useUpdateShiftApiV1HrRostersShiftsCodePatch();

  async function toggleActive(shift: ShiftCatalogPublic) {
    try {
      await updateMutation.mutateAsync({
        code: shift.code,
        data: { is_active: !shift.is_active },
      });
      await queryClient.invalidateQueries({
        queryKey: listShiftCatalogApiV1HrRostersShiftsGetQueryKey(),
      });
      toast.success(
        shift.is_active
          ? `Deactivated "${shift.code}"`
          : `Reactivated "${shift.code}"`
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Could not update shift: ${detail}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ShiftTypeDialog
          trigger={
            <Button size="sm" type="button">
              <Plus data-icon="inline-start" />
              New shift type
            </Button>
          }
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shifts.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground text-sm"
                colSpan={6}
              >
                {shiftsQuery.isLoading
                  ? "Loading…"
                  : "No shift types yet — add one to start building rosters."}
              </TableCell>
            </TableRow>
          ) : (
            shifts.map((shift) => (
              <TableRow
                className={shift.is_active ? undefined : "opacity-60"}
                key={shift.code}
              >
                <TableCell className="font-medium">{shift.code}</TableCell>
                <TableCell>{shift.label}</TableCell>
                <TableCell className="capitalize">
                  {shift.category.toLowerCase()}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {shift.start_time && shift.end_time
                    ? `${shift.start_time}–${shift.end_time}${shift.ends_next_day ? " (+1)" : ""}`
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={shift.is_active ? "default" : "outline"}>
                    {shift.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <ShiftTypeDialog
                      existing={shift}
                      trigger={
                        <Button size="sm" type="button" variant="ghost">
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                      }
                    />
                    <Button
                      disabled={updateMutation.isPending}
                      onClick={() => toggleActive(shift)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {shift.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
