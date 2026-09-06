"use client";
import type { AccountSecurityPublic } from "@barrelsgd/api-client";
import Link from "next/link";
import { useState } from "react";
import { AccountControls } from "./account-controls";
import { activateMfa, beginMfa } from "./actions";

export function SecurityPanel({
  security,
}: {
  security: AccountSecurityPublic;
}) {
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(security.totp_enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-4xl border border-(--line) bg-(--panel-strong) p-6">
        <h2 className="font-semibold text-xl">Sign-in methods</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt>Email verification</dt>
            <dd>
              {security.email_verified ? "Verified" : "Verification pending"}
            </dd>
          </div>
          <div>
            <dt>Google</dt>
            <dd>{security.google_linked ? "Connected" : "Not connected"}</dd>
          </div>
        </dl>
        {!security.email_verified && (
          <Link className="block underline" href="/verify-email">
            Verify email and set password
          </Link>
        )}
        {security.google_configured ? (
          <Link className="block underline" href="/google/start">
            Continue with your matching Google account
          </Link>
        ) : (
          <p className="text-(--muted) text-sm">
            Google sign-in is awaiting service configuration.
          </p>
        )}
      </section>
      <section className="space-y-4 rounded-4xl border border-(--line) bg-(--panel-strong) p-6">
        <h2 className="font-semibold text-xl">Authenticator protection</h2>
        <p>
          {enabled
            ? "Two-factor authentication is enabled."
            : "Add an authenticator app to protect sign-in. Administrators should complete this before production launch."}
        </p>
        {!(enabled || secret) && (
          <button
            className="rounded-full border px-5 py-3"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await beginMfa();
                setSecret(result.secret);
                setMessage("");
              } catch {
                setMessage("Unable to start authenticator setup.");
              } finally {
                setBusy(false);
              }
            }}
            type="button"
          >
            Set up authenticator
          </button>
        )}
        {secret && !enabled && (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              const data = new FormData(event.currentTarget);
              try {
                await activateMfa(String(data.get("code") ?? ""));
                setEnabled(true);
                setSecret("");
                setMessage(
                  "Authenticator enabled. Future sign-ins require its code."
                );
              } catch {
                setMessage(
                  "That code was not accepted. Try the current code from your authenticator."
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              Enter this setup key in your authenticator app. Keep it private.
            </p>
            <code className="block break-all rounded border p-3">{secret}</code>
            <label className="block">
              Current six-digit code
              <input
                autoComplete="one-time-code"
                className="mt-2 block rounded border bg-background p-3"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                name="code"
                pattern="[0-9]{6}"
                required
              />
            </label>
            <button
              className="rounded-full border px-5 py-3"
              disabled={busy}
              type="submit"
            >
              Confirm authenticator
            </button>
          </form>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      <AccountControls
        mfaEnabled={enabled}
        onMfaDisabled={() => setEnabled(false)}
        security={security}
      />
    </div>
  );
}
