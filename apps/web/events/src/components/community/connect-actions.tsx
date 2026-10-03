"use client";

import { Button, buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Ban, Flag, MessageSquare, UserCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ConnectionState } from "@/data/discovery";

/**
 * Connect, message, report and block for a profile. Messaging is offered
 * only when the safety rule allows it (`canMessage`).
 */
export function ConnectActions({
  canMessage,
  initialState,
  messageHref,
  name,
}: {
  canMessage: boolean;
  initialState: ConnectionState;
  messageHref: string | null;
  name: string;
}) {
  const [state, setState] = useState(initialState);
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  if (state === "self") {
    return null;
  }

  if (blocked) {
    return (
      <div className="space-y-2">
        <p className="rounded-xl bg-muted p-3 text-body">
          You blocked {name}. They can't message you or see your activity.
        </p>
        <Button onClick={() => setBlocked(false)} variant="ghost">
          Undo
        </Button>
      </div>
    );
  }

  const primary = {
    none: { label: "Connect", icon: UserPlus, next: "sent" as const },
    sent: { label: "Request sent", icon: UserCheck, next: "none" as const },
    received: {
      label: "Accept request",
      icon: UserCheck,
      next: "connected" as const,
    },
    connected: {
      label: "Connected",
      icon: UserCheck,
      next: "connected" as const,
    },
  }[state];
  const PrimaryIcon = primary.icon;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          aria-pressed={state === "connected" || state === "sent"}
          disabled={state === "connected"}
          onClick={() => setState(primary.next)}
          size="lg"
          variant={
            state === "none" || state === "received" ? "default" : "outline"
          }
        >
          <PrimaryIcon data-icon="inline-start" />
          {primary.label}
        </Button>
        {canMessage && messageHref ? (
          <Link
            className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
            href={messageHref}
          >
            <MessageSquare data-icon="inline-start" />
            Message
          </Link>
        ) : (
          <Button
            disabled
            size="lg"
            title="Connect or join a shared group to message"
            variant="outline"
          >
            <MessageSquare data-icon="inline-start" />
            Message
          </Button>
        )}
      </div>
      <div className="flex gap-1">
        <Button
          onClick={() =>
            setNotice(`Thanks. Our team will review your report about ${name}.`)
          }
          size="sm"
          variant="ghost"
        >
          <Flag data-icon="inline-start" />
          Report
        </Button>
        <Button onClick={() => setBlocked(true)} size="sm" variant="ghost">
          <Ban data-icon="inline-start" />
          Block
        </Button>
      </div>
      {notice ? (
        <p className="text-caption text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
