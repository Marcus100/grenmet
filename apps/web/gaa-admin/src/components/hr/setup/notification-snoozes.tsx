"use client";

import {
  type NotificationSettingPublic,
  notificationsGetNotificationSnoozesQueryKey,
  useNotificationsCreateNotificationSnooze,
  useNotificationsDeleteNotificationSnooze,
  useNotificationsGetNotificationSnoozes,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
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
import { useQueryClient } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const HOUR_MS = 3_600_000;
const DEFAULT_HOURS = 24;
const DURATIONS = [
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
];

function SnoozeDialog({
  events,
  onClose,
  onCreate,
  saving,
}: {
  readonly events: NotificationSettingPublic[];
  readonly onClose: () => void;
  readonly onCreate: (body: {
    event_key: string;
    until: string;
    reason: string;
    entity_type: string | null;
    entity_id: string | null;
  }) => Promise<void>;
  readonly saving: boolean;
}) {
  const [eventKey, setEventKey] = useState(events[0]?.event_key ?? "");
  const [hours, setHours] = useState(String(DEFAULT_HOURS));
  const [reason, setReason] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (Boolean(entityType.trim()) !== Boolean(entityId.trim())) {
      toast.error(
        "Give both the item type and the item id, or leave both empty"
      );
      return;
    }
    await onCreate({
      event_key: eventKey,
      until: new Date(Date.now() + Number(hours) * HOUR_MS).toISOString(),
      reason: reason.trim(),
      entity_type: entityType.trim() || null,
      entity_id: entityId.trim() || null,
    });
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Snooze a notification</DialogTitle>
            <DialogDescription>
              Nobody is notified about it until the snooze ends, for example
              during planned maintenance. You can end it early.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="snooze-event">Notification</FieldLabel>
              <NativeSelect
                id="snooze-event"
                onChange={(e) => setEventKey(e.target.value)}
                value={eventKey}
              >
                {events.map((setting) => (
                  <NativeSelectOption
                    key={setting.event_key}
                    value={setting.event_key}
                  >
                    {setting.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="snooze-hours">For how long</FieldLabel>
              <NativeSelect
                id="snooze-hours"
                onChange={(e) => setHours(e.target.value)}
                value={hours}
              >
                {DURATIONS.map((duration) => (
                  <NativeSelectOption
                    key={duration.hours}
                    value={String(duration.hours)}
                  >
                    {duration.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="snooze-reason">Reason</FieldLabel>
              <Input
                id="snooze-reason"
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. planned maintenance"
                value={reason}
              />
            </Field>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Only one item (advanced)
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <Field>
                  <FieldLabel htmlFor="snooze-entity-type">
                    Item type
                  </FieldLabel>
                  <Input
                    id="snooze-entity-type"
                    maxLength={60}
                    onChange={(e) => setEntityType(e.target.value)}
                    value={entityType}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="snooze-entity-id">Item id</FieldLabel>
                  <Input
                    id="snooze-entity-id"
                    maxLength={100}
                    onChange={(e) => setEntityId(e.target.value)}
                    value={entityId}
                  />
                  <FieldDescription>
                    Leave both empty to snooze the whole notification.
                  </FieldDescription>
                </Field>
              </div>
            </details>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={saving || !eventKey} type="submit">
              Snooze
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NotificationSnoozes({
  events,
  organisationId,
}: {
  readonly events: NotificationSettingPublic[];
  readonly organisationId: string;
}) {
  const queryClient = useQueryClient();
  const query = useNotificationsGetNotificationSnoozes({
    query: { organisation_id: organisationId },
  });
  const create = useNotificationsCreateNotificationSnooze();
  const remove = useNotificationsDeleteNotificationSnooze();
  const [creating, setCreating] = useState(false);
  const labels = new Map(events.map((e) => [e.event_key, e.label]));

  function refresh() {
    return queryClient.invalidateQueries({
      queryKey: notificationsGetNotificationSnoozesQueryKey({}).slice(0, 1),
    });
  }

  async function createSnooze(
    body: Parameters<typeof create.mutateAsync>[0]["body"]
  ) {
    try {
      await create.mutateAsync({
        query: { organisation_id: organisationId },
        body,
      });
      await refresh();
      setCreating(false);
      toast.success("Notification snoozed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Snooze failed");
    }
  }

  async function endSnooze(id: string) {
    try {
      await remove.mutateAsync({
        path: { snooze_id: id },
        query: { organisation_id: organisationId },
      });
      await refresh();
      toast.success("Snooze ended");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not end it");
    }
  }

  const snoozes = query.data ?? [];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-lg">Snoozes</h3>
          <p className="text-muted-foreground text-sm">
            Silence a notification for a while, for example during planned
            maintenance. Snoozed notifications are not sent to anyone.
          </p>
        </div>
        <Button
          disabled={events.length === 0}
          onClick={() => setCreating(true)}
          type="button"
          variant="outline"
        >
          <BellOff data-icon="inline-start" />
          Snooze a notification
        </Button>
      </div>
      {query.isError ? (
        <p className="text-destructive text-sm">Snoozes could not be loaded.</p>
      ) : null}
      {!query.isError && snoozes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {query.isLoading ? "Loading…" : "No active snoozes."}
        </p>
      ) : null}
      {snoozes.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Notification</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Until</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snoozes.map((snooze) => {
                const label = labels.get(snooze.event_key) ?? snooze.event_key;
                return (
                  <TableRow key={snooze.id}>
                    <TableCell className="whitespace-normal font-medium">
                      {label}
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm">
                      {snooze.entity_id
                        ? `${snooze.entity_type}: ${snooze.entity_id}`
                        : "Whole notification"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(snooze.until).toLocaleString()}
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm">
                      {snooze.reason || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        aria-label={`End snooze for ${label}`}
                        disabled={remove.isPending}
                        onClick={() => endSnooze(snooze.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        End snooze
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {creating ? (
        <SnoozeDialog
          events={events}
          onClose={() => setCreating(false)}
          onCreate={createSnooze}
          saving={create.isPending}
        />
      ) : null}
    </section>
  );
}
