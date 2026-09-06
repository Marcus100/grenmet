"use client";

import {
  type CalendarEventPublic,
  useCreateCalendarEventApiV1HrCalendarEventsPost,
  useUpdateCalendarEventApiV1HrCalendarEventsEventIdPatch,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { invalidateAfterCalendarEventChange } from "@/lib/hr-invalidation";

/**
 * Add or edit a department calendar entry.
 *
 * Anything staff consider worth recording belongs here — a meeting, a training
 * day, an inspection, a visiting delegation, a maintenance window, a deadline.
 * Times are department-local wall clock, the same frame the duty roster uses,
 * so the datetime-local inputs are sent through unchanged with no offset.
 */

const KINDS = [
  { value: "MEETING", label: "Meeting" },
  { value: "TRAINING", label: "Training" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "VISIT", label: "Visit" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "OBSERVANCE", label: "Observance" },
  { value: "DEADLINE", label: "Deadline" },
  { value: "OTHER", label: "Other" },
] as const;

/** "2026-07-06T09:30:00" -> "2026-07-06T09:30", what datetime-local expects. */
function toInputValue(local: string): string {
  return local.slice(0, 16);
}

/** A datetime-local value carries no offset already; add the seconds back. */
function toApiValue(input: string, allDay: boolean): string {
  if (allDay) return `${input.slice(0, 10)}T00:00:00`;
  return `${input}:00`;
}

function defaultStart(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function addHour(value: string): string {
  const [datePart, timePart] = value.split("T");
  const [hours, minutes] = timePart.split(":").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${datePart}T${pad((hours + 1) % 24)}:${pad(minutes)}`;
}

export interface EventDialogProps {
  event?: CalendarEventPublic;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function EventDialog({ event, onOpenChange, open }: EventDialogProps) {
  const queryClient = useQueryClient();
  const createMutation = useCreateCalendarEventApiV1HrCalendarEventsPost();
  const updateMutation =
    useUpdateCalendarEventApiV1HrCalendarEventsEventIdPatch();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("MEETING");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(() => addHour(defaultStart()));
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setKind(event.kind);
      setStartsAt(toInputValue(event.starts_at_local));
      setEndsAt(toInputValue(event.ends_at_local));
      setAllDay(event.all_day);
      setLocation(event.location ?? "");
      setDescription(event.description ?? "");
      return;
    }
    const start = defaultStart();
    setTitle("");
    setKind("MEETING");
    setStartsAt(start);
    setEndsAt(addHour(start));
    setAllDay(false);
    setLocation("");
    setDescription("");
  }, [event, open]);

  const isEdit = Boolean(event);
  const pending = createMutation.isPending || updateMutation.isPending;
  const invalidRange = endsAt < startsAt;

  async function save() {
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      kind: kind as CalendarEventPublic["kind"],
      starts_at: toApiValue(startsAt, allDay),
      ends_at: toApiValue(endsAt, allDay),
      all_day: allDay,
      location: location.trim() || null,
    };
    try {
      if (event) {
        await updateMutation.mutateAsync({ event_id: event.id, data: body });
      } else {
        await createMutation.mutateAsync({ data: body });
      }
      await invalidateAfterCalendarEventChange(queryClient);
      toast.success(isEdit ? "Event updated" : "Added to the calendar");
      onOpenChange(false);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Could not save: ${detail}`);
    }
  }

  async function cancelEvent() {
    if (!event) return;
    try {
      await updateMutation.mutateAsync({
        event_id: event.id,
        data: { cancelled: !event.is_cancelled },
      });
      await invalidateAfterCalendarEventChange(queryClient);
      toast.success(
        event.is_cancelled ? "Event restored" : "Event marked cancelled"
      );
      onOpenChange(false);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Could not cancel: ${detail}`);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit calendar entry" : "Add to the calendar"}
          </DialogTitle>
          <DialogDescription>
            Anything the department needs on record — a meeting, training, an
            inspection, a visit, a deadline. Everyone in the department sees it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="event-title">Title</FieldLabel>
            <Input
              id="event-title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Monthly staff meeting"
              value={title}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="event-kind">Kind</FieldLabel>
            <NativeSelect
              id="event-kind"
              onChange={(e) => setKind(e.target.value)}
              value={kind}
            >
              {KINDS.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <label
            className="flex items-center gap-2 text-sm"
            htmlFor="event-all-day"
          >
            <input
              checked={allDay}
              id="event-all-day"
              onChange={(e) => setAllDay(e.target.checked)}
              type="checkbox"
            />
            All day
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="event-start">Starts</FieldLabel>
              <Input
                id="event-start"
                onChange={(e) => setStartsAt(e.target.value)}
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? startsAt.slice(0, 10) : startsAt}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="event-end">Ends</FieldLabel>
              <Input
                id="event-end"
                onChange={(e) => setEndsAt(e.target.value)}
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? endsAt.slice(0, 10) : endsAt}
              />
            </Field>
          </div>
          {invalidRange ? (
            <p className="text-destructive text-xs">
              The end must not be before the start.
            </p>
          ) : null}

          <Field>
            <FieldLabel htmlFor="event-location">Location</FieldLabel>
            <Input
              id="event-location"
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Met office conference room"
              value={location}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="event-description">Notes</FieldLabel>
            <Textarea
              id="event-description"
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              value={description}
            />
          </Field>
        </div>

        <DialogFooter>
          {isEdit ? (
            <Button
              className="mr-auto"
              disabled={pending}
              onClick={cancelEvent}
              type="button"
              variant="outline"
            >
              {event?.is_cancelled ? "Restore" : "Mark cancelled"}
            </Button>
          ) : null}
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={pending || !title.trim() || invalidRange}
            onClick={save}
            type="button"
          >
            {isEdit ? "Save changes" : "Add event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
