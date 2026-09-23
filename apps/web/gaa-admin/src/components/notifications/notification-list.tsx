"use client";

import {
  type NotificationPublic,
  notificationsGetNotificationsQueryKey,
  notificationsGetUnreadCountQueryKey,
  useNotificationsGetNotifications,
  useNotificationsMarkAllNotificationsRead,
  useNotificationsMarkNotificationRead,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCheck } from "lucide-react";
import Link from "next/link";

/** Refresh the badge and every inbox page after a read-state change. */
export function useRefreshNotifications() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: notificationsGetUnreadCountQueryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: notificationsGetNotificationsQueryKey().slice(0, 1),
      }),
    ]);
}

function NotificationRow({
  notification,
  onOpen,
}: {
  readonly notification: NotificationPublic;
  readonly onOpen: (notification: NotificationPublic) => void;
}) {
  const unread = !notification.read_at;
  const content = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className={cn("text-sm", unread && "font-medium")}>
        {notification.title}
      </span>
      {notification.body ? (
        <span className="text-muted-foreground text-sm">
          {notification.body}
        </span>
      ) : null}
      <span className="text-muted-foreground text-xs">
        {formatDistanceToNow(new Date(notification.created_at), {
          addSuffix: true,
        })}
      </span>
    </div>
  );
  const className = cn(
    "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted",
    unread && "bg-muted/50"
  );
  const dot = (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 size-2 shrink-0 rounded-full",
        unread ? "bg-primary" : "bg-transparent"
      )}
    />
  );
  return (
    <li>
      {notification.link_path ? (
        <Link
          className={className}
          href={notification.link_path}
          onClick={() => onOpen(notification)}
        >
          {dot}
          {content}
        </Link>
      ) : (
        <button
          className={className}
          onClick={() => onOpen(notification)}
          type="button"
        >
          {dot}
          {content}
        </button>
      )}
    </li>
  );
}

export function NotificationList({
  size = 20,
  unreadOnly = false,
  onNavigate,
}: {
  readonly size?: number;
  readonly unreadOnly?: boolean;
  readonly onNavigate?: () => void;
}) {
  const query = useNotificationsGetNotifications({
    query: { size, unread: unreadOnly },
  });
  const markRead = useNotificationsMarkNotificationRead();
  const markAll = useNotificationsMarkAllNotificationsRead();
  const refresh = useRefreshNotifications();
  const items = query.data?.data ?? [];

  async function open(notification: NotificationPublic) {
    onNavigate?.();
    if (!notification.read_at) {
      await markRead.mutateAsync({
        path: { notification_id: notification.id },
      });
      await refresh();
    }
  }

  async function readAll() {
    await markAll.mutateAsync(undefined);
    await refresh();
  }

  if (query.isLoading) {
    return <p className="p-3 text-muted-foreground text-sm">Loading…</p>;
  }
  if (query.isError) {
    return (
      <p className="p-3 text-destructive text-sm">
        Notifications could not be loaded.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-muted-foreground text-sm">
          {query.data?.count ?? 0} {unreadOnly ? "unread" : "total"}
        </span>
        <Button
          disabled={markAll.isPending || items.every((item) => item.read_at)}
          onClick={readAll}
          size="sm"
          type="button"
          variant="ghost"
        >
          <CheckCheck data-icon="inline-start" />
          Mark all read
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="p-3 text-muted-foreground text-sm">
          You're all caught up.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <NotificationRow key={item.id} notification={item} onOpen={open} />
          ))}
        </ul>
      )}
    </div>
  );
}
