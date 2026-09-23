"use client";

import { useNotificationsGetUnreadCount } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@barrelsgd/ui/components/ui/popover";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { NotificationList } from "./notification-list";

// Polling keeps shift staff current without a push channel; one small count query.
const POLL_MS = 60_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const countQuery = useNotificationsGetUnreadCount({
    query: { refetchInterval: POLL_MS, refetchOnWindowFocus: true },
  });
  const unread = countQuery.data?.count ?? 0;
  const label =
    unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={label}
            className="relative"
            size="icon"
            type="button"
            variant="ghost"
          >
            <Bell />
            {unread > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground leading-4">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-2">
        {open ? (
          <NotificationList onNavigate={() => setOpen(false)} size={8} />
        ) : null}
        <div className="border-border border-t pt-2">
          <Button
            className="w-full"
            onClick={() => setOpen(false)}
            render={<Link href="/notifications" />}
            size="sm"
            variant="ghost"
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
