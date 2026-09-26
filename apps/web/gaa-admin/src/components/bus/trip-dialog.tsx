"use client";

import type {
  TimetableTripInput,
  TimetableTripView,
  TransportCatalogue,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import {
  Dialog,
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
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { moveItem } from "@/lib/transport/timetable";
import { errorMessage, saveTrip } from "./api";

interface StopRow {
  key: number;
  stopId: number;
  time: string;
  timepoint: boolean;
}

interface TripForm extends Omit<TimetableTripInput, "stops" | "arriveTime"> {
  arriveTime: string;
  stops: StopRow[];
}

let rowKey = 0;
const nextKey = () => {
  rowKey += 1;
  return rowKey;
};

function initialForm(
  catalogue: TransportCatalogue,
  trip: TimetableTripView | null,
  routeId: number | null
): TripForm {
  if (trip) {
    return {
      routeId: trip.routeId,
      shiftId: trip.shiftId,
      calendarId: trip.calendarId,
      direction: trip.direction,
      departTime: trip.departTime,
      arriveTime: trip.arriveTime ?? "",
      status: trip.status,
      notes: trip.notes,
      sourceRef: trip.sourceRef,
      stops: trip.stops.map((stop) => ({
        key: nextKey(),
        stopId: stop.stopId,
        time: stop.time ?? "",
        timepoint: stop.timepoint,
      })),
    };
  }
  return {
    routeId: routeId ?? catalogue.routes[0]?.id ?? 0,
    shiftId: catalogue.shifts[0]?.id ?? 0,
    calendarId: catalogue.calendars[0]?.id ?? 0,
    direction: "inbound",
    departTime: "",
    arriveTime: "",
    status: "confirmed",
    notes: null,
    sourceRef: null,
    stops: [],
  };
}

/** The API body: blank optional times become null, stop rows lose their keys. */
export function toTripInput(form: TripForm): TimetableTripInput {
  return {
    ...form,
    arriveTime: form.arriveTime || null,
    notes: form.notes || null,
    sourceRef: form.sourceRef || null,
    stops: form.stops.map((row) => ({
      stopId: row.stopId,
      time: row.time || null,
      timepoint: Boolean(row.time) && row.timepoint,
    })),
  };
}

export function TripDialog({
  catalogue,
  onOpenChange,
  onSaved,
  open,
  routeId,
  trip,
  versionId,
}: {
  catalogue: TransportCatalogue;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
  routeId: number | null;
  trip: TimetableTripView | null;
  versionId: number;
}) {
  const id = useId();
  const [form, setForm] = useState(() => initialForm(catalogue, trip, routeId));
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (body: TimetableTripInput) =>
      saveTrip(versionId, trip?.id ?? null, body),
  });
  const set = <K extends keyof TripForm>(key: K, value: TripForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setRow = (index: number, patch: Partial<StopRow>) =>
    set(
      "stops",
      form.stops.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  const activeStops = catalogue.stops.filter(
    (stop) => stop.active || form.stops.some((row) => row.stopId === stop.id)
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await mutation.mutateAsync(toTripInput(form));
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the trip"));
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{trip ? "Edit trip" : "Add trip"}</DialogTitle>
            <DialogDescription>
              Times are HH:MM after midnight on the service day; use 24:00 or
              later for a night trip that runs past midnight.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-3">
            <Field className="w-56">
              <FieldLabel htmlFor={`${id}-route`}>Route</FieldLabel>
              <NativeSelect
                id={`${id}-route`}
                onChange={(e) => set("routeId", Number(e.target.value))}
                value={form.routeId}
              >
                {catalogue.routes.map((route) => (
                  <NativeSelectOption key={route.id} value={route.id}>
                    {route.number} — {route.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field className="w-36">
              <FieldLabel htmlFor={`${id}-shift`}>Shift</FieldLabel>
              <NativeSelect
                id={`${id}-shift`}
                onChange={(e) => set("shiftId", Number(e.target.value))}
                value={form.shiftId}
              >
                {catalogue.shifts.map((shift) => (
                  <NativeSelectOption key={shift.id} value={shift.id}>
                    {shift.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field className="w-60">
              <FieldLabel htmlFor={`${id}-calendar`}>Runs on</FieldLabel>
              <NativeSelect
                id={`${id}-calendar`}
                onChange={(e) => set("calendarId", Number(e.target.value))}
                value={form.calendarId}
              >
                {catalogue.calendars.map((calendar) => (
                  <NativeSelectOption key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field className="w-36">
              <FieldLabel htmlFor={`${id}-direction`}>Direction</FieldLabel>
              <NativeSelect
                id={`${id}-direction`}
                onChange={(e) =>
                  set(
                    "direction",
                    e.target.value as TimetableTripInput["direction"]
                  )
                }
                value={form.direction}
              >
                <NativeSelectOption value="inbound">To MBIA</NativeSelectOption>
                <NativeSelectOption value="outbound">
                  From MBIA
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field className="w-24">
              <FieldLabel htmlFor={`${id}-depart`}>Departs</FieldLabel>
              <Input
                id={`${id}-depart`}
                inputMode="numeric"
                onChange={(e) => set("departTime", e.target.value)}
                placeholder="HH:MM"
                required
                value={form.departTime}
              />
            </Field>
            <Field className="w-24">
              <FieldLabel htmlFor={`${id}-arrive`}>Arrives</FieldLabel>
              <Input
                id={`${id}-arrive`}
                inputMode="numeric"
                onChange={(e) => set("arriveTime", e.target.value)}
                placeholder="HH:MM"
                value={form.arriveTime}
              />
            </Field>
            <Field className="w-56">
              <FieldLabel htmlFor={`${id}-status`}>Status</FieldLabel>
              <NativeSelect
                id={`${id}-status`}
                onChange={(e) =>
                  set("status", e.target.value as TimetableTripInput["status"])
                }
                value={form.status}
              >
                <NativeSelectOption value="confirmed">
                  Confirmed
                </NativeSelectOption>
                <NativeSelectOption value="awaiting_confirmation">
                  Awaiting confirmation
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
            <Textarea
              id={`${id}-notes`}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              value={form.notes ?? ""}
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="font-medium text-sm">Stops in order</legend>
            {form.stops.length === 0 ? (
              <p className="text-muted-foreground text-sm">No stops yet.</p>
            ) : null}
            <ol className="space-y-2">
              {form.stops.map((row, index) => (
                <li className="flex flex-wrap items-center gap-2" key={row.key}>
                  <span className="w-6 text-right text-muted-foreground text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <NativeSelect
                    aria-label={`Stop ${index + 1}`}
                    className="w-64"
                    onChange={(e) =>
                      setRow(index, { stopId: Number(e.target.value) })
                    }
                    value={row.stopId}
                  >
                    {activeStops.map((stop) => (
                      <NativeSelectOption key={stop.id} value={stop.id}>
                        {stop.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Input
                    aria-label={`Time at stop ${index + 1}`}
                    className="w-20"
                    inputMode="numeric"
                    onChange={(e) => setRow(index, { time: e.target.value })}
                    placeholder="HH:MM"
                    value={row.time}
                  />
                  <label
                    className="flex items-center gap-1.5 text-xs"
                    htmlFor={`${id}-exact-${row.key}`}
                  >
                    <Checkbox
                      checked={row.timepoint}
                      disabled={!row.time}
                      id={`${id}-exact-${row.key}`}
                      onCheckedChange={(value) =>
                        setRow(index, { timepoint: Boolean(value) })
                      }
                    />
                    Exact time
                  </label>
                  <Button
                    aria-label={`Move stop ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() =>
                      set("stops", moveItem(form.stops, index, -1))
                    }
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    aria-label={`Move stop ${index + 1} down`}
                    disabled={index === form.stops.length - 1}
                    onClick={() => set("stops", moveItem(form.stops, index, 1))}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    aria-label={`Remove stop ${index + 1}`}
                    onClick={() =>
                      set(
                        "stops",
                        form.stops.filter((_, i) => i !== index)
                      )
                    }
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ol>
            <Button
              disabled={activeStops.length === 0}
              onClick={() =>
                set("stops", [
                  ...form.stops,
                  {
                    key: nextKey(),
                    stopId: activeStops[0]?.id ?? 0,
                    time: "",
                    timepoint: false,
                  },
                ])
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus /> Add stop
            </Button>
          </fieldset>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? "Saving…" : "Save trip"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
