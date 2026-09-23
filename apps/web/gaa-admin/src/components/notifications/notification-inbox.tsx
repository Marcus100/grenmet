"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { NotificationList } from "./notification-list";

export function NotificationInbox() {
  return (
    <Tabs className="gap-4" defaultValue="unread">
      <TabsList>
        <TabsTrigger value="unread">Unread</TabsTrigger>
        <TabsTrigger value="all">All</TabsTrigger>
      </TabsList>
      <TabsContent className="rounded-xl border bg-card p-2" value="unread">
        <NotificationList size={50} unreadOnly />
      </TabsContent>
      <TabsContent className="rounded-xl border bg-card p-2" value="all">
        <NotificationList size={50} />
      </TabsContent>
    </Tabs>
  );
}
