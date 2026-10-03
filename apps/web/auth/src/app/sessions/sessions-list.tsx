"use client";
import type { SecuritySessionPublic } from "@barrelsgd/api-client";
import { MonitorIcon, SmartphoneIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/account-layout";
import { formatRelative } from "@/lib/profile";
import { describeDevice } from "@/lib/user-agent";
import { revokeSecuritySession } from "../security/actions";

const outlineButton =
  "rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted disabled:opacity-50";

export function SessionsList({
  currentSessionId,
  sessions: initialSessions,
}: {
  currentSessionId: string;
  sessions: readonly SecuritySessionPublic[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [busy, setBusy] = useState<string | null>(null);
  // This browser first, then most recently used.
  const ordered = [...sessions].sort((a, b) => {
    if (a.id === currentSessionId) return -1;
    if (b.id === currentSessionId) return 1;
    return b.last_used_at.localeCompare(a.last_used_at);
  });
  const others = sessions.filter((session) => session.id !== currentSessionId);

  async function revoke(ids: readonly string[]) {
    const revoked: string[] = [];
    for (const id of ids) {
      try {
        await revokeSecuritySession(id);
        revoked.push(id);
      } catch {
        // Reported below; keep going so one stale session doesn't block the rest.
      }
    }
    setSessions((items) => items.filter((item) => !revoked.includes(item.id)));
    if (revoked.length === ids.length) {
      toast.success(
        revoked.length === 1
          ? "Session signed out"
          : "Other sessions signed out"
      );
    } else {
      toast.error("Some sessions couldn't be signed out. Try again.");
    }
  }

  return (
    <div className="space-y-4">
      {others.length > 0 ? (
        <div className="flex justify-end">
          <button
            className={outlineButton}
            disabled={busy !== null}
            onClick={async () => {
              setBusy("others");
              await revoke(others.map((session) => session.id));
              setBusy(null);
            }}
            type="button"
          >
            {busy === "others" ? "Signing out…" : "Sign out other sessions"}
          </button>
        </div>
      ) : null}
      <ul className="divide-y divide-border border-border border-y">
        {ordered.map((session) => {
          const device = describeDevice(session.user_agent);
          const Icon = device.mobile ? SmartphoneIcon : MonitorIcon;
          const isCurrent = session.id === currentSessionId;
          const detail = [
            session.app_name,
            session.ip_address,
            isCurrent
              ? "Active now"
              : `Last active ${formatRelative(session.last_used_at)}`,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li className="flex items-center gap-4 py-4" key={session.id}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-foreground text-sm">
                  {device.label}
                  {isCurrent ? (
                    <StatusBadge tone="on">This device</StatusBadge>
                  ) : null}
                </p>
                <p className="truncate text-muted-foreground text-sm">
                  {detail}
                </p>
              </div>
              {isCurrent ? null : (
                <button
                  aria-label={`Sign out ${device.label}`}
                  className={outlineButton}
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(session.id);
                    await revoke([session.id]);
                    setBusy(null);
                  }}
                  type="button"
                >
                  Sign out
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No active sessions.</p>
      ) : null}
    </div>
  );
}
