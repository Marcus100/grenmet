"use client";

import type { TransportStop, TransportStopInput } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { useMutation } from "@tanstack/react-query";
import { MapPinOff, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { errorMessage, saveStop } from "./api";
import { mappedStops, StopsMap } from "./stops-map";

export function StopsManager({
  canManage,
  stops,
}: {
  canManage: boolean;
  stops: TransportStop[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ stop: TransportStop | null } | null>(
    null
  );
  const pins = useMemo(() => mappedStops(stops), [stops]);
  const needle = query.trim().toLowerCase();
  const visible = stops.filter(
    (stop) =>
      !needle ||
      stop.name.toLowerCase().includes(needle) ||
      (stop.code ?? "").toLowerCase().includes(needle) ||
      (stop.landmark ?? "").toLowerCase().includes(needle)
  );

  return (
    <div className="space-y-4">
      <StopsMap
        highlightId={selected}
        onSelect={(id) => {
          setSelected(id);
          document
            .getElementById(`stop-row-${id}`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
        }}
        pins={pins}
      />
      <p className="text-muted-foreground text-sm">
        {pins.length} of {stops.length} stops are on the map. Drivers and staff
        need a map location to see where a stop is and, later, live arrivals.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          aria-label="Search stops"
          className="w-64"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, code or landmark"
          type="search"
          value={query}
        />
        {canManage ? (
          <Button onClick={() => setEditing({ stop: null })} variant="outline">
            <Plus /> Add stop
          </Button>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden lg:table-cell">Landmark</TableHead>
            <TableHead className="w-28">Routes</TableHead>
            <TableHead className="w-24">Map</TableHead>
            {canManage ? (
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((stop) => (
            <TableRow
              className={stop.id === selected ? "bg-muted" : undefined}
              id={`stop-row-${stop.id}`}
              key={stop.id}
              onClick={() => setSelected(stop.id)}
            >
              <TableCell className="font-mono text-xs">{stop.code}</TableCell>
              <TableCell>
                {stop.name}
                {stop.active ? null : (
                  <Badge className="ml-2" variant="light-light">
                    Inactive
                  </Badge>
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {stop.landmark}
              </TableCell>
              <TableCell className="tabular-nums">
                {stop.routeNumbers.join(", ") || "—"}
              </TableCell>
              <TableCell>
                {stop.latitude == null ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                    <MapPinOff aria-hidden="true" className="size-3.5" /> Not
                    set
                  </span>
                ) : (
                  <span className="text-xs">Mapped</span>
                )}
              </TableCell>
              {canManage ? (
                <TableCell>
                  <Button
                    aria-label={`Edit ${stop.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing({ stop });
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Pencil />
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing ? (
        <StopDialog
          key={editing.stop?.id ?? "new"}
          onClose={() => setEditing(null)}
          pins={pins}
          stop={editing.stop}
        />
      ) : null}
    </div>
  );
}

/** Form state → API body; a location is sent only as a complete pair. */
export function toStopInput(form: {
  active: boolean;
  code: string;
  landmark: string;
  latitude: string;
  longitude: string;
  name: string;
}): TransportStopInput {
  const hasLocation =
    form.latitude.trim() !== "" && form.longitude.trim() !== "";
  return {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    landmark: form.landmark.trim() || null,
    latitude: hasLocation ? Number(form.latitude) : null,
    longitude: hasLocation ? Number(form.longitude) : null,
    active: form.active,
  };
}

function StopDialog({
  onClose,
  pins,
  stop,
}: {
  onClose: () => void;
  pins: ReturnType<typeof mappedStops>;
  stop: TransportStop | null;
}) {
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState({
    code: stop?.code ?? "",
    name: stop?.name ?? "",
    landmark: stop?.landmark ?? "",
    latitude: stop?.latitude == null ? "" : String(stop.latitude),
    longitude: stop?.longitude == null ? "" : String(stop.longitude),
    active: stop?.active ?? true,
  });
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: () => saveStop(stop?.id ?? null, toStopInput(form)),
  });
  const picked =
    form.latitude && form.longitude
      ? {
          id: "picked" as const,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          name: form.name || "New location",
        }
      : null;
  const others = pins.filter((pin) => pin.id !== stop?.id);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await mutation.mutateAsync();
      toast.success("Stop saved");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the stop"));
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{stop ? "Edit stop" : "Add stop"}</DialogTitle>
            <DialogDescription>
              Click the map to place the stop. Changes apply to every timetable
              version immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-3">
            <Field className="w-40">
              <FieldLabel htmlFor={`${id}-code`}>Code</FieldLabel>
              <Input
                id={`${id}-code`}
                maxLength={32}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                pattern="[A-Za-z0-9][A-Za-z0-9\-]*"
                required
                value={form.code}
              />
            </Field>
            <Field className="w-72">
              <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
              <Input
                id={`${id}-name`}
                maxLength={200}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                value={form.name}
              />
            </Field>
            <Field className="w-full">
              <FieldLabel htmlFor={`${id}-landmark`}>Landmark</FieldLabel>
              <Input
                id={`${id}-landmark`}
                maxLength={2000}
                onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                placeholder="e.g. Opposite the police station"
                value={form.landmark}
              />
            </Field>
          </div>
          <StopsMap
            height={260}
            highlightId="picked"
            onPick={({ latitude, longitude }) =>
              setForm({
                ...form,
                latitude: String(latitude),
                longitude: String(longitude),
              })
            }
            pins={picked ? [...others, picked] : others}
          />
          <div className="flex flex-wrap items-end gap-3">
            <Field className="w-32">
              <FieldLabel htmlFor={`${id}-lat`}>Latitude</FieldLabel>
              <Input
                id={`${id}-lat`}
                inputMode="decimal"
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                value={form.latitude}
              />
            </Field>
            <Field className="w-32">
              <FieldLabel htmlFor={`${id}-lon`}>Longitude</FieldLabel>
              <Input
                id={`${id}-lon`}
                inputMode="decimal"
                onChange={(e) =>
                  setForm({ ...form, longitude: e.target.value })
                }
                value={form.longitude}
              />
            </Field>
            {picked ? (
              <Button
                onClick={() =>
                  setForm({ ...form, latitude: "", longitude: "" })
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear location
              </Button>
            ) : null}
            <label
              className="flex items-center gap-2 pb-2 text-sm"
              htmlFor={`${id}-active`}
            >
              <Checkbox
                checked={form.active}
                id={`${id}-active`}
                onCheckedChange={(value) =>
                  setForm({ ...form, active: Boolean(value) })
                }
              />
              Active
            </label>
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              Save stop
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
