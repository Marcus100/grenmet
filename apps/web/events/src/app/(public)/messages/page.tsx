import type { Metadata } from "next";
import { ThreadList } from "@/components/community/thread-list";
import { requireViewer } from "@/data/viewer";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  await requireViewer("/messages");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-heading-base sm:text-heading-md font-bold tracking-tight">
        Messages
      </h1>
      <ThreadList />
    </div>
  );
}
