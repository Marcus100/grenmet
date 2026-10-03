import type { Metadata } from "next";
import { ThreadList } from "@/components/community/thread-list";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-bold font-display text-heading-base tracking-tight sm:text-heading-md">
        Messages
      </h1>
      <ThreadList />
    </div>
  );
}
