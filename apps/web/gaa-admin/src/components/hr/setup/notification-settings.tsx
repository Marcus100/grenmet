"use client";

import {
  type NotificationParams,
  type NotificationSettingPublic,
  type NotificationSettingUpdate,
  notificationsGetNotificationSettingsQueryKey,
  useNotificationsGetNotificationSettings,
  useNotificationsUpdateNotificationSetting,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
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
import { Switch } from "@barrelsgd/ui/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PARAM_LABELS: Record<keyof NotificationParams, string> = {
  remind_after_days: "Remind the approver after (days)",
  escalate_after_days: "Escalate after (days)",
  expiry_days_before: "Remind before expiry (days, comma-separated)",
};

function toUpdate(
  setting: NotificationSettingPublic,
  patch: Partial<NotificationSettingUpdate> = {}
): NotificationSettingUpdate {
  return {
    enabled: setting.enabled,
    email_enabled: setting.email_enabled,
    recipient_roles: setting.recipient_roles,
    title_template: setting.title_template,
    body_template: setting.body_template,
    params: setting.params,
    ...patch,
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function EditDialog({
  setting,
  onClose,
  onSave,
  saving,
}: {
  readonly setting: NotificationSettingPublic;
  readonly onClose: () => void;
  readonly onSave: (body: NotificationSettingUpdate) => Promise<void>;
  readonly saving: boolean;
}) {
  const [title, setTitle] = useState(setting.title_template);
  const [body, setBody] = useState(setting.body_template);
  const [roles, setRoles] = useState(setting.recipient_roles.join(", "));
  const paramKeys = (
    Object.keys(setting.params) as (keyof NotificationParams)[]
  ).filter(
    (key) => setting.params[key] !== null && setting.params[key] !== undefined
  );
  const [params, setParams] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      paramKeys.map((key) => {
        const value = setting.params[key];
        return [key, Array.isArray(value) ? value.join(", ") : String(value)];
      })
    )
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed: NotificationParams = {};
    for (const key of paramKeys) {
      const numbers = splitList(params[key] ?? "").map(Number);
      if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) {
        toast.error(`${PARAM_LABELS[key]}: use whole days between 1 and 365`);
        return;
      }
      if (key === "expiry_days_before") {
        parsed.expiry_days_before = numbers;
      } else {
        parsed[key] = numbers[0];
      }
    }
    await onSave(
      toUpdate(setting, {
        title_template: title,
        body_template: body,
        recipient_roles: splitList(roles),
        params: parsed,
      })
    );
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{setting.label}</DialogTitle>
            <DialogDescription>
              Sent to: {setting.audience}. Keep wording to a summary — emails
              leave the portal.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ntf-title">Title</FieldLabel>
              <Input
                id="ntf-title"
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                value={title}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ntf-body">Message</FieldLabel>
              <Textarea
                id="ntf-body"
                maxLength={1000}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                value={body}
              />
              <FieldDescription>
                Available:{" "}
                {setting.variables.map((v) => `{{ ${v} }}`).join(" ")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ntf-roles">Also notify roles</FieldLabel>
              <Input
                id="ntf-roles"
                onChange={(e) => setRoles(e.target.value)}
                placeholder="e.g. hr-admin"
                value={roles}
              />
              <FieldDescription>
                Comma-separated role names. Holders are notified within the
                department or organisation their role covers.
              </FieldDescription>
            </Field>
            {paramKeys.map((key) => (
              <Field key={key}>
                <FieldLabel htmlFor={`ntf-${key}`}>
                  {PARAM_LABELS[key]}
                </FieldLabel>
                <Input
                  id={`ntf-${key}`}
                  inputMode="numeric"
                  onChange={(e) =>
                    setParams((current) => ({
                      ...current,
                      [key]: e.target.value,
                    }))
                  }
                  value={params[key] ?? ""}
                />
              </Field>
            ))}
          </FieldGroup>
          <DialogFooter>
            <Button
              onClick={() => {
                setTitle(setting.default_title_template);
                setBody(setting.default_body_template);
              }}
              type="button"
              variant="ghost"
            >
              Restore default wording
            </Button>
            <Button disabled={saving} type="submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const query = useNotificationsGetNotificationSettings({});
  const update = useNotificationsUpdateNotificationSetting();
  const [editing, setEditing] = useState<NotificationSettingPublic | null>(
    null
  );

  async function save(eventKey: string, body: NotificationSettingUpdate) {
    try {
      await update.mutateAsync({
        path: { event_key: eventKey },
        query: { organisation_id: query.data?.organisation_id },
        body,
      });
      await queryClient.invalidateQueries({
        queryKey: notificationsGetNotificationSettingsQueryKey({}).slice(0, 1),
      });
      setEditing(null);
      toast.success("Notification saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    }
  }

  if (query.isLoading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (query.isError || !query.data) {
    return (
      <p className="text-destructive text-sm">
        Notification settings could not be loaded. They need the
        notifications.manage permission.
      </p>
    );
  }
  const { events, unreachable, allowed_domains: domains } = query.data;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-lg">Notifications</h2>
        <p className="text-muted-foreground text-sm">
          What the portal tells people, and whether it also emails them.
          {domains.length > 0
            ? ` Email is limited to ${domains.join(", ")} in this environment.`
            : ""}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Notification</TableHead>
              <TableHead>Sent to</TableHead>
              <TableHead>On</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Wording &amp; timing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((setting) => (
              <TableRow key={setting.event_key}>
                <TableCell className="min-w-56 whitespace-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      {setting.label}{" "}
                      {setting.customised ? (
                        <Badge variant="outline">Customised</Badge>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {setting.description}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="min-w-40 whitespace-normal text-sm">
                  {setting.audience}
                  {setting.recipient_roles.length > 0
                    ? ` · roles: ${setting.recipient_roles.join(", ")}`
                    : ""}
                </TableCell>
                <TableCell>
                  <Switch
                    aria-label={`${setting.label} on`}
                    checked={setting.enabled}
                    disabled={update.isPending}
                    onCheckedChange={(checked) =>
                      save(
                        setting.event_key,
                        toUpdate(setting, { enabled: checked })
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    aria-label={`${setting.label} by email`}
                    checked={setting.email_enabled}
                    disabled={update.isPending || !setting.enabled}
                    onCheckedChange={(checked) =>
                      save(
                        setting.event_key,
                        toUpdate(setting, { email_enabled: checked })
                      )
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    aria-label={`Edit ${setting.label}`}
                    onClick={() => setEditing(setting)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil data-icon="inline-start" />
                    Edit<span className="sr-only"> {setting.label}</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {unreachable.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <h3 className="font-medium">
            Staff who only get in-app notifications ({unreachable.length})
          </h3>
          <p className="text-muted-foreground text-sm">
            Their email address is outside the allowed domains, so no email is
            sent. Update their account email to reach them.
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {unreachable.map((person) => (
              <li key={person.user_id}>
                {person.name}{" "}
                <span className="text-muted-foreground">{person.email}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {editing ? (
        <EditDialog
          onClose={() => setEditing(null)}
          onSave={(body) => save(editing.event_key, body)}
          saving={update.isPending}
          setting={editing}
        />
      ) : null}
    </div>
  );
}
