"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  errorBoxClass,
  primaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { PasswordField } from "@/components/password-field";
import { reportError } from "@/lib/report-error";
import { changeAccountPassword } from "../security/actions";

export function ChangePasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);

  if (changed) {
    return (
      <div className="space-y-5">
        <div
          className="rounded-lg border border-border bg-muted px-5 py-4 text-sm leading-6"
          role="status"
        >
          <p className="font-medium text-foreground">Password changed</p>
          <p className="mt-1 text-muted-foreground">
            You've been signed out everywhere, including here.
          </p>
        </div>
        <Link className={`${primaryButtonClass} block`} href="/">
          Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form
      className="max-w-md space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const next = String(data.get("new_password") ?? "");
        if (next !== data.get("confirm_password")) {
          setError("New passwords must match.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          await changeAccountPassword(
            String(data.get("current_password") ?? ""),
            next
          );
          setChanged(true);
          toast.success("Password changed");
        } catch (error) {
          reportError(error, "auth-password");
          setError(
            "Password change failed. Check your current password and try again."
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {error ? (
        <div className={errorBoxClass} role="alert">
          {error}
        </div>
      ) : null}
      <PasswordField
        autoComplete="current-password"
        id="current_password"
        label="Current password"
        labelAside={
          <Link
            className={`${textLinkClass} text-body-sm`}
            href="/forgot-password"
          >
            Forgot it?
          </Link>
        }
        name="current_password"
      />
      <PasswordField
        autoComplete="new-password"
        id="new_password"
        label="New password"
        name="new_password"
        placeholder="At least 12 characters"
        showStrength
      />
      <PasswordField
        autoComplete="new-password"
        id="confirm_password"
        label="Confirm new password"
        name="confirm_password"
      />
      <button className={primaryButtonClass} disabled={busy} type="submit">
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
