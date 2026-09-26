"use client";

import type { TransportRoute } from "@barrelsgd/api-client";
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
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { errorMessage, saveRoute } from "./api";

interface Target {
  route: TransportRoute | null;
}

export function RoutesManager({
  canManage,
  routes,
}: {
  canManage: boolean;
  routes: TransportRoute[];
}) {
  const [target, setTarget] = useState<Target | null>(null);
  return (
    <section aria-labelledby="routes-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-lg" id="routes-heading">
          Routes
        </h2>
        {canManage ? (
          <Button
            onClick={() => setTarget({ route: null })}
            size="sm"
            variant="outline"
          >
            <Plus /> Add route
          </Button>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">No.</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Description</TableHead>
            <TableHead className="w-24">Status</TableHead>
            {canManage ? (
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {routes.map((route) => (
            <TableRow key={route.id}>
              <TableCell className="tabular-nums">{route.number}</TableCell>
              <TableCell>{route.name}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {route.description}
              </TableCell>
              <TableCell>
                {route.active ? (
                  <Badge variant="light-success">Active</Badge>
                ) : (
                  <Badge variant="light-light">Inactive</Badge>
                )}
              </TableCell>
              {canManage ? (
                <TableCell>
                  <Button
                    aria-label={`Edit route ${route.number}`}
                    onClick={() => setTarget({ route })}
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
      {target ? (
        <RouteDialog
          key={target.route?.id ?? "new"}
          onClose={() => setTarget(null)}
          route={target.route}
        />
      ) : null}
    </section>
  );
}

function RouteDialog({
  onClose,
  route,
}: {
  onClose: () => void;
  route: TransportRoute | null;
}) {
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState({
    number: route ? String(route.number) : "",
    name: route?.name ?? "",
    description: route?.description ?? "",
    active: route?.active ?? true,
  });
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      saveRoute(route?.id ?? null, {
        number: Number(form.number),
        name: form.name,
        description: form.description || null,
        active: form.active,
      }),
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await mutation.mutateAsync();
      toast.success("Route saved");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the route"));
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="sm:max-w-lg">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{route ? "Edit route" : "Add route"}</DialogTitle>
            <DialogDescription>
              Route details change immediately for every timetable version.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-3">
            <Field className="w-20">
              <FieldLabel htmlFor={`${id}-number`}>Number</FieldLabel>
              <Input
                id={`${id}-number`}
                inputMode="numeric"
                max={999}
                min={1}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                required
                type="number"
                value={form.number}
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
          </div>
          <Field>
            <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
            <Textarea
              id={`${id}-description`}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="e.g. Along the Western Main Road unto MBIA"
              rows={2}
              value={form.description}
            />
          </Field>
          <label
            className="flex items-center gap-2 text-sm"
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
              Save route
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
