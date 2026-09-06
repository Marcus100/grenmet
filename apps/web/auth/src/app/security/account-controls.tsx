"use client";
import type { AccountSecurityPublic } from "@barrelsgd/api-client";
import Link from "next/link";
import { useState } from "react";
import {
  changeAccountPassword,
  disableMfa,
  replaceRecoveryCodes,
  revokeSecuritySession,
} from "./actions";

const panel =
  "space-y-4 rounded-4xl border border-(--line) bg-(--panel-strong) p-6";
const input =
  "mt-2 block w-full rounded-lg border border-(--line) bg-background p-3";
const button = "rounded-full border px-5 py-3 disabled:opacity-50";

export function AccountControls({
  security,
  mfaEnabled,
  onMfaDisabled,
}: {
  security: AccountSecurityPublic;
  mfaEnabled: boolean;
  onMfaDisabled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(
    security.recovery_codes_remaining ?? 0
  );
  const [sessions, setSessions] = useState(security.sessions);
  return (
    <div className="space-y-6">
      {message && <p role="status">{message}</p>}
      <section className={panel}>
        <h2 className="font-semibold text-xl">Password</h2>
        <p className="text-(--muted) text-sm">
          Changing your password signs out your saved sessions. Use at least 12
          characters.
        </p>
        {passwordChanged ? (
          <Link className="underline" href="/">
            Sign in with your new password
          </Link>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const next = String(data.get("new_password") ?? "");
              if (next !== data.get("confirm_password")) {
                setMessage("New passwords must match.");
                return;
              }
              setBusy(true);
              setMessage("");
              try {
                await changeAccountPassword(
                  String(data.get("current_password") ?? ""),
                  next
                );
                form.reset();
                setPasswordChanged(true);
                setMessage(
                  "Password changed. Sign in again to manage your account."
                );
              } catch {
                setMessage(
                  "Password change failed. Check your current password and try again."
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block">
              Current password
              <input
                autoComplete="current-password"
                className={input}
                name="current_password"
                required
                type="password"
              />
            </label>
            <label className="block">
              New password
              <input
                autoComplete="new-password"
                className={input}
                maxLength={128}
                minLength={12}
                name="new_password"
                required
                type="password"
              />
            </label>
            <label className="block">
              Confirm new password
              <input
                autoComplete="new-password"
                className={input}
                maxLength={128}
                minLength={12}
                name="confirm_password"
                required
                type="password"
              />
            </label>
            <button className={button} disabled={busy} type="submit">
              Change password
            </button>
          </form>
        )}
        <Link className="block underline" href="/forgot-password">
          Forgot your current password?
        </Link>
      </section>
      {mfaEnabled && !passwordChanged && (
        <section className={panel}>
          <h2 className="font-semibold text-xl">Authenticator recovery</h2>
          <p>{remaining} unused recovery codes</p>
          <p className="text-(--muted) text-sm">
            Store your codes somewhere private. Each works once in place of an
            authenticator code. Generating replacements invalidates the old
            codes.
          </p>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              setBusy(true);
              setMessage("");
              try {
                const password = String(data.get("password") ?? "");
                const code = String(data.get("code") ?? "");
                if (data.get("operation") === "disable") {
                  await disableMfa(password, code);
                  setCodes([]);
                  setRemaining(0);
                  onMfaDisabled();
                  setMessage(
                    "Authenticator disabled and recovery codes invalidated."
                  );
                } else {
                  const result = await replaceRecoveryCodes(password, code);
                  setCodes(result.codes);
                  setRemaining(result.codes.length);
                  setMessage(
                    "Save these new recovery codes before leaving this page."
                  );
                }
                form.reset();
              } catch {
                setMessage(
                  "Account confirmation failed. Check your password and authenticator or recovery code."
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block">
              Confirm account password
              <input
                autoComplete="current-password"
                className={input}
                name="password"
                required
                type="password"
              />
            </label>
            <label className="block">
              Authenticator or recovery code
              <input
                autoComplete="one-time-code"
                className={input}
                maxLength={64}
                minLength={6}
                name="code"
                required
              />
            </label>
            <label className="block">
              Authenticator action
              <select className={input} name="operation">
                <option value="codes">
                  Generate replacement recovery codes
                </option>
                <option value="disable">
                  Disable authenticator protection
                </option>
              </select>
            </label>
            <button className={button} disabled={busy} type="submit">
              Confirm authenticator action
            </button>
          </form>
          {codes.length > 0 && (
            <div className="rounded-lg border p-4">
              <p className="mb-3 font-medium">Your new recovery codes</p>
              <ul className="grid gap-2 font-mono text-sm sm:grid-cols-2">
                {codes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <section className={panel}>
        <h2 className="font-semibold text-xl">Active sessions</h2>
        <p className="text-(--muted) text-sm">
          Sign out an individual session, or use “Sign out everywhere” on your
          account page. Signing out this browser requires you to sign in again.
        </p>
        {sessions.length === 0 && <p>No active sessions recorded.</p>}
        <ul className="divide-y">
          {sessions.map((session) => (
            <li
              className="flex items-center justify-between gap-4 py-3"
              key={session.id}
            >
              <div>
                <p>{session.app_name || session.client_type}</p>
                <p className="text-(--muted) text-sm">
                  Last used{" "}
                  {session.last_used_at.slice(0, 16).replace("T", " ")} UTC
                </p>
              </div>
              <button
                className={button}
                disabled={busy || passwordChanged}
                onClick={async () => {
                  setBusy(true);
                  setMessage("");
                  try {
                    await revokeSecuritySession(session.id);
                    setSessions((items) =>
                      items.filter((item) => item.id !== session.id)
                    );
                    setMessage("Session signed out.");
                  } catch {
                    setMessage(
                      "Unable to sign out this session. You may need to sign in again."
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                type="button"
              >
                Sign out
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
