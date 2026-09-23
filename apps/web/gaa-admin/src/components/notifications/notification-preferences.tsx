"use client";

import {
  notificationsGetNotificationPreferencesQueryKey,
  useNotificationsGetNotificationPreferences,
  useNotificationsUpdateNotificationPreferences,
} from "@barrelsgd/api-client";
import { Switch } from "@barrelsgd/ui/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/** Personal email opt-outs. In-app notifications are always kept. */
export function NotificationPreferences() {
  const queryClient = useQueryClient();
  const query = useNotificationsGetNotificationPreferences();
  const update = useNotificationsUpdateNotificationPreferences();

  async function toggle(eventKey: string, emailEnabled: boolean) {
    try {
      const saved = await update.mutateAsync({
        body: [{ event_key: eventKey, email_enabled: emailEnabled }],
      });
      queryClient.setQueryData(
        notificationsGetNotificationPreferencesQueryKey(),
        saved
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save preference"
      );
    }
  }

  if (query.isLoading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (query.isError || !query.data) {
    return (
      <p className="text-destructive text-sm">
        Notification preferences could not be loaded.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-lg">Email notifications</h2>
        <p className="text-muted-foreground text-sm">
          Everything always appears under the bell. Choose which you also want
          by email. Approval requests are always emailed so nothing waits on you
          unseen.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {query.data.map((preference) => {
          const id = `pref-${preference.event_key}`;
          return (
            <li
              className="flex items-center justify-between gap-4 py-3"
              key={preference.event_key}
            >
              <label className="flex flex-col gap-0.5" htmlFor={id}>
                <span className="font-medium text-sm">{preference.label}</span>
                <span className="text-muted-foreground text-sm">
                  {preference.email_mutable
                    ? preference.description
                    : `${preference.description} Always emailed.`}
                </span>
              </label>
              <Switch
                checked={preference.email_enabled}
                disabled={!preference.email_mutable || update.isPending}
                id={id}
                onCheckedChange={(checked) =>
                  toggle(preference.event_key, checked)
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
