import type { Metadata } from "next";
import Link from "next/link";
import { NotificationInbox } from "@/components/notifications/notification-inbox";

export const metadata: Metadata = { title: "Notifications | GAA" };

export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-medium text-3xl">Notifications</h1>
        <p className="text-muted-foreground">
          Approvals waiting for you, decisions on your requests and reminders.
          Choose which ones you also get by email in{" "}
          <Link
            className="underline underline-offset-4"
            href="/profile?tab=notifications"
          >
            your profile
          </Link>
          .
        </p>
      </div>
      <NotificationInbox />
    </div>
  );
}
