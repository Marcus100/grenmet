"use client";

import {
  hrListHolidaysQueryKey,
  type PublicHolidayPublic,
  useHrCreateHoliday,
  useHrListHolidays,
  useHrLoadProvisionalHolidays,
  useHrRemoveHoliday,
  useHrUpdateHoliday,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";

interface HolidayForm {
  holidayDate: string;
  name: string;
  needsVerification: boolean;
  source: string;
}

const EMPTY_FORM: HolidayForm = {
  holidayDate: "",
  name: "",
  needsVerification: false,
  source: "",
};

interface HolidaysManagerProps {
  canManage: boolean;
}

/**
 * Public holidays used by the calendar and rosters. Rows loaded from the
 * provisional Grenada calendar are labelled until GAA HR confirms them.
 */
export function HolidaysManager({ canManage }: HolidaysManagerProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM);
  const queryClient = useQueryClient();
  const holidaysQuery = useHrListHolidays({ query: { year } });
  const createMutation = useHrCreateHoliday();
  const updateMutation = useHrUpdateHoliday();
  const removeMutation = useHrRemoveHoliday();
  const loadMutation = useHrLoadProvisionalHolidays();
  const holidays = holidaysQuery.data?.data ?? [];
  const ready = form.name.trim() !== "" && form.holidayDate !== "";

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: hrListHolidaysQueryKey() });

  function reset() {
    setEditingId(undefined);
    setForm(EMPTY_FORM);
  }

  function edit(holiday: PublicHolidayPublic) {
    setEditingId(holiday.id);
    setForm({
      holidayDate: holiday.holiday_date,
      name: holiday.name,
      needsVerification: holiday.needs_verification ?? false,
      source: holiday.source ?? "",
    });
  }

  async function save() {
    const body = {
      name: form.name.trim(),
      holiday_date: form.holidayDate,
      source: form.source.trim() || null,
      needs_verification: form.needsVerification,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          path: { holiday_id: editingId },
          body,
        });
      } else {
        await createMutation.mutateAsync({ body });
      }
      toast.success("Holiday saved");
      reset();
      await refresh();
    } catch (error) {
      reportError(error, "hr-holiday-save");
      toast.error("Could not save the holiday. Check the date is not in use.");
    }
  }

  async function remove(holiday: PublicHolidayPublic) {
    try {
      await removeMutation.mutateAsync({ path: { holiday_id: holiday.id } });
      toast.success(`Removed ${holiday.name}`);
      await refresh();
    } catch (error) {
      reportError(error, "hr-holiday-remove");
      toast.error("Could not remove the holiday");
    }
  }

  async function loadProvisional() {
    try {
      const added = await loadMutation.mutateAsync({ body: { year } });
      toast.success(
        added.count === 0
          ? `No new provisional holidays for ${year}`
          : `Added ${added.count} provisional holiday(s) for ${year}`
      );
      await refresh();
    } catch (error) {
      reportError(error, "hr-holiday-provisional");
      toast.error("Could not load provisional holidays");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Holidays shown on the calendar and rosters. Provisional rows come from a
        best-effort Grenada calendar and must be confirmed by GAA HR; edit or
        delete any row to match the official list.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-28">
          <FieldLabel htmlFor="holiday-year">Year</FieldLabel>
          <Input
            id="holiday-year"
            max={2100}
            min={2000}
            onChange={(event) => setYear(Number(event.target.value))}
            type="number"
            value={year}
          />
        </Field>
        {canManage && (
          <Button
            disabled={loadMutation.isPending || year < 2000 || year > 2100}
            onClick={loadProvisional}
            type="button"
            variant="outline"
          >
            Load provisional {year} holidays
          </Button>
        )}
      </div>
      {holidaysQuery.isError && (
        <p role="alert">Unable to load holidays. Refresh to retry.</p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Holiday</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            {canManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {holidays.length === 0 && !holidaysQuery.isPending && (
            <TableRow>
              <TableCell colSpan={5}>
                No holidays recorded for {year}.
              </TableCell>
            </TableRow>
          )}
          {holidays.map((holiday) => (
            <TableRow key={holiday.id}>
              <TableCell>{holiday.holiday_date}</TableCell>
              <TableCell>{holiday.name}</TableCell>
              <TableCell>
                {holiday.needs_verification ? (
                  <Badge variant="outline">Verify with HR</Badge>
                ) : (
                  <Badge variant="secondary">Confirmed</Badge>
                )}
              </TableCell>
              <TableCell>{holiday.source ?? ""}</TableCell>
              {canManage && (
                <TableCell className="space-x-2 text-right">
                  <Button
                    onClick={() => edit(holiday)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => remove(holiday)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Delete
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {canManage ? (
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <h3 className="text-sm font-medium">
            {editingId ? "Edit holiday" : "Add holiday"}
          </h3>
          <FieldGroup className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="holiday-name">Name</FieldLabel>
              <Input
                id="holiday-name"
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                value={form.name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="holiday-date">Date</FieldLabel>
              <Input
                id="holiday-date"
                onChange={(event) =>
                  setForm({ ...form, holidayDate: event.target.value })
                }
                type="date"
                value={form.holidayDate}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="holiday-source">Source</FieldLabel>
              <Input
                id="holiday-source"
                onChange={(event) =>
                  setForm({ ...form, source: event.target.value })
                }
                value={form.source}
              />
            </Field>
          </FieldGroup>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.needsVerification}
              id="holiday-verify"
              onCheckedChange={(checked) =>
                setForm({ ...form, needsVerification: checked === true })
              }
            />
            <FieldLabel htmlFor="holiday-verify">
              Still needs HR verification
            </FieldLabel>
          </div>
          <div className="flex gap-2">
            <Button disabled={!ready} type="submit">
              {editingId ? "Save changes" : "Add holiday"}
            </Button>
            {editingId && (
              <Button onClick={reset} type="button" variant="outline">
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <p className="text-sm">
          Holidays are managed by global roster administrators.
        </p>
      )}
    </div>
  );
}
