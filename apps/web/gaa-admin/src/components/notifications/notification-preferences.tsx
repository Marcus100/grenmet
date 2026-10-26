"use client";

import {
  notificationsGetNotificationPreferencesQueryKey,
  useNotificationsGetNotificationPreferences,
  useNotificationsUpdateNotificationPreferences,
} from "@barrelsgd/api-client";
import { Switch } from "@barrelsgd/ui/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/** Personal choice per notification: the bell and email. Urgent ones keep the bell. */
export function NotificationPreferences() {
  const queryClient = useQueryClient();
  const query = useNotificationsGetNotificationPreferences();
  const update = useNotificationsUpdateNotificationPreferences();

  async function toggle(
    eventKey: string,
    channel: "bell_enabled" | "email_enabled",
    enabled: boolean
  ) {
    try {
      const saved = await update.mutateAsync({
        body: [{ event_key: eventKey, [channel]: enabled }],
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
    <div className="flex flex-col gap-4 rounded-xl border border-border p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-lg">Notifications</h2>
        <p className="text-muted-foreground text-sm">
          Choose, for each notification, whether it appears under the bell, in
          your email, or both. Urgent notifications always appear under the
          bell, and approval requests are always emailed so nothing waits on you
          unseen. Repeats of the same notification are grouped into one.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {query.data.map((preference) => (
          <li
            className="flex items-center justify-between gap-4 py-3"
            key={preference.event_key}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-sm">
                {preference.label}
                {preference.urgent ? (
                  <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 font-normal text-destructive text-xs">
                    Urgent
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground text-sm">
                {preference.description}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span aria-hidden>Bell</span>
                <Switch
                  aria-label={`${preference.label}, bell`}
                  checked={preference.bell_enabled}
                  disabled={!preference.bell_mutable || update.isPending}
                  onCheckedChange={(checked) =>
                    toggle(preference.event_key, "bell_enabled", checked)
                  }
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span aria-hidden>Email</span>
                <Switch
                  aria-label={`${preference.label}, email`}
                  checked={preference.email_enabled}
                  disabled={!preference.email_mutable || update.isPending}
                  onCheckedChange={(checked) =>
                    toggle(preference.event_key, "email_enabled", checked)
                  }
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
