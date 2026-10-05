"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { useState } from "react";
import {
  acceptConnection,
  removeConnection,
  requestConnection,
} from "@/data/actions";
import { useMemberAction } from "./use-member-action";

/** Accept, decline, withdraw or remove a connection from the network page. */
export function ConnectionActions({
  connectionId,
  state,
}: {
  connectionId: string;
  state: "connected" | "sent" | "received";
}) {
  const [done, setDone] = useState<string | null>(null);
  const { error, pending, perform } = useMemberAction();

  async function run(
    label: string,
    call: Parameters<typeof perform>[0]
  ): Promise<void> {
    const result = await perform(call);
    if (result.ok) {
      setDone(label);
    }
  }

  if (done) {
    return <span className="text-caption text-muted-foreground">{done}</span>;
  }

  return (
    <span className="flex items-center gap-1">
      {state === "received" ? (
        <Button
          disabled={pending}
          onClick={() => run("Accepted", () => acceptConnection(connectionId))}
          size="sm"
        >
          Accept
        </Button>
      ) : null}
      <Button
        disabled={pending}
        onClick={() =>
          run(state === "connected" ? "Removed" : "Cancelled", () =>
            removeConnection(connectionId)
          )
        }
        size="sm"
        variant="outline"
      >
        {{ connected: "Remove", received: "Decline", sent: "Withdraw" }[state]}
      </Button>
      {error ? (
        <span className="text-caption text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Send a connection request to a suggested person. */
export function ConnectButton({ handle }: { handle: string }) {
  const [sent, setSent] = useState(false);
  const { error, pending, perform } = useMemberAction();

  async function connect() {
    const result = await perform(() => requestConnection(handle));
    if (result.ok) {
      setSent(true);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        disabled={pending || sent}
        onClick={connect}
        size="sm"
        variant={sent ? "outline" : "default"}
      >
        {sent ? "Requested" : "Connect"}
      </Button>
      {error ? (
        <span className="text-caption text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
