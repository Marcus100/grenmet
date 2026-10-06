"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Ban, Flag, MessageSquare, UserCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  openDirectThread,
  reportSubject,
  requestConnection,
  setBlocked,
} from "@/data/actions";
import type { ConnectionState } from "@/domain/types";
import { useMemberAction } from "./use-member-action";

/**
 * Connect, message, report and block for a profile. Messaging is offered
 * only when the API says the safety rule allows it (`canMessage`).
 */
export function ConnectActions({
  canMessage,
  directThreadId,
  handle,
  initialState,
  name,
}: {
  canMessage: boolean;
  directThreadId: string | null;
  handle: string;
  initialState: ConnectionState;
  name: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const { error, pending, perform } = useMemberAction();

  if (state === "self") {
    return null;
  }

  async function connect() {
    const result = await perform(() => requestConnection(handle));
    if (result.ok) {
      setState(state === "received" ? "connected" : "sent");
    }
  }

  async function message() {
    if (directThreadId) {
      router.push(`/messages/${directThreadId}`);
      return;
    }
    const result = await perform(() => openDirectThread(handle));
    if (result.ok) {
      router.push(`/messages/${result.data}`);
    }
  }

  async function block() {
    const result = await perform(() => setBlocked(handle, true));
    if (result.ok) {
      router.replace("/network");
    }
  }

  async function report() {
    const result = await perform(() =>
      reportSubject({
        reason: reason.trim(),
        subject_id: handle,
        subject_type: "profile",
      })
    );
    if (result.ok) {
      setReporting(false);
      setReason("");
      setNotice(`Thanks. Our team will review your report about ${name}.`);
    }
  }

  const primary = {
    none: { label: "Connect", icon: UserPlus },
    sent: { label: "Request sent", icon: UserCheck },
    received: { label: "Accept request", icon: UserCheck },
    connected: { label: "Connected", icon: UserCheck },
    blocked: { label: "Blocked", icon: Ban },
  }[state];
  const PrimaryIcon = primary.icon;
  const canConnect = state === "none" || state === "received";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          aria-pressed={state === "connected" || state === "sent"}
          disabled={pending || !canConnect}
          onClick={connect}
          size="lg"
          variant={canConnect ? "default" : "outline"}
        >
          <PrimaryIcon data-icon="inline-start" />
          {primary.label}
        </Button>
        <Button
          disabled={pending || !canMessage}
          onClick={message}
          size="lg"
          title={
            canMessage ? undefined : "Connect or join a shared group to message"
          }
          variant="outline"
        >
          <MessageSquare data-icon="inline-start" />
          Message
        </Button>
      </div>
      <div className="flex gap-1">
        <Button
          onClick={() => setReporting((open) => !open)}
          size="sm"
          variant="ghost"
        >
          <Flag data-icon="inline-start" />
          Report
        </Button>
        <Button disabled={pending} onClick={block} size="sm" variant="ghost">
          <Ban data-icon="inline-start" />
          Block
        </Button>
      </div>
      {reporting ? (
        <form
          className="flex max-w-md gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            report();
          }}
        >
          <label className="sr-only" htmlFor="report-reason">
            What's wrong?
          </label>
          <Input
            id="report-reason"
            maxLength={1000}
            minLength={3}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What's wrong?"
            required
            value={reason}
          />
          <Button disabled={pending || reason.trim().length < 3} type="submit">
            Send
          </Button>
        </form>
      ) : null}
      {notice ? (
        <p className="text-caption text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
