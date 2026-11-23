"use client";
import type { SecuritySessionPublic } from "@barrelsgd/api-client";
import { MonitorIcon, SmartphoneIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/account-layout";
import { formatRelative } from "@/lib/profile";
import { describeDevice } from "@/lib/user-agent";
import { revokeSecuritySession } from "../security/actions";

const outlineButton =
  "rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted disabled:opacity-50";

/**
 * The current time, known only after the first browser render. Relative times
 * ("5 minutes ago") depend on it, so the server and the first client render
 * leave them out; reading Date.now() during render made the server HTML and
 * the browser disagree (React error 418).
 */
export function useMountedNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function SessionsList({
  currentSessionId,
  sessions: initialSessions,
}: {
  currentSessionId: string;
  sessions: readonly SecuritySessionPublic[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useMountedNow();
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
        revoked.length === 1 ? "Device signed out" : "Other devices signed out"
      );
    } else {
      toast.error("Some devices couldn't be signed out. Try again.");
    }
  }

  const otherCount = others.length;
  const otherLabel = `Sign out the other ${otherCount} ${otherCount === 1 ? "device" : "devices"}`;

  return (
    <div className="space-y-4">
      {others.length > 0 ? (
        <div className="flex flex-col items-end gap-1">
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
            {busy === "others" ? "Signing out…" : otherLabel}
          </button>
          <p className="text-muted-foreground text-xs">
            Keeps this device signed in.
          </p>
        </div>
      ) : null}
      <ul className="divide-border border-border divide-y border-y">
        {ordered.map((session) => {
          const device = describeDevice(session.user_agent);
          const Icon = device.mobile ? SmartphoneIcon : MonitorIcon;
          const isCurrent = session.id === currentSessionId;
          const lastActive =
            now === null ? null : formatRelative(session.last_used_at, now);
          const detail = [
            session.app_name,
            session.ip_address,
            isCurrent
              ? "Active now"
              : lastActive && `Last active ${lastActive}`,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li className="flex items-center gap-4 py-4" key={session.id}>
              <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground flex flex-wrap items-center gap-2 text-sm font-medium">
                  {device.label}
                  {isCurrent ? (
                    <StatusBadge tone="on">This device</StatusBadge>
                  ) : null}
                </p>
                <p className="text-muted-foreground truncate text-sm">
                  {detail}
                </p>
              </div>
              {isCurrent ? null : (
                <button
                  // Names the device and its details so each button is unique
                  // to a screen reader user, not just "Sign out" nine times.
                  aria-label={`Sign out ${device.label}, ${detail}`}
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
