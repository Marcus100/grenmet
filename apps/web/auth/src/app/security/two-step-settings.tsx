"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import { cn } from "@barrelsgd/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { SettingsRow, StatusBadge } from "@/components/account-layout";
import { CodeField } from "@/components/code-field";
import { errorBoxClass, primaryButtonClass } from "@/components/form-styles";
import { PasswordField } from "@/components/password-field";
import { reportError } from "@/lib/report-error";
import {
  activateMfa,
  beginMfa,
  disableMfa,
  replaceRecoveryCodes,
} from "./actions";
import { QrCode } from "./qr-code";
import { RecoveryCodes } from "./recovery-codes";

const outlineButton =
  "rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted disabled:opacity-50";
const dangerButton =
  "rounded-lg border border-destructive/30 px-3 py-1.5 font-medium text-destructive text-sm transition hover:bg-destructive/10 disabled:opacity-50";

function readForm(form: HTMLFormElement, key: string): string {
  return String(new FormData(form).get(key) ?? "").trim();
}

/** Password plus a current factor; every change to two-step asks for both. */
function ConfirmIdentityFields() {
  return (
    <>
      <PasswordField
        autoComplete="current-password"
        id="confirm_password"
        label="Account password"
        name="password"
      />
      <CodeField
        allowRecovery
        id="confirm_code"
        label="Authenticator code"
        name="code"
      />
    </>
  );
}

type SetupStep =
  | { kind: "scan"; secret: string; uri: string }
  | { kind: "codes" }
  | { kind: "done"; codes: string[] };

function SetupDialog({
  onEnabled,
  onOpenChange,
  step,
  setStep,
}: {
  onEnabled: (codes: number) => void;
  onOpenChange: (open: boolean) => void;
  setStep: (step: SetupStep) => void;
  step: SetupStep | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(task: () => Promise<void>, failure: string) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (error) {
      reportError(error, "auth-two-step");
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={step !== null}>
      <DialogContent className="sm:max-w-md">
        {step?.kind === "scan" && (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              const code = readForm(event.currentTarget, "code");
              run(async () => {
                await activateMfa(code);
                onEnabled(0);
                setStep({ kind: "codes" });
              }, "That code was not accepted. Try the current code from your app.");
            }}
          >
            <DialogHeader>
              <DialogTitle>Set up your authenticator</DialogTitle>
              <DialogDescription>
                Step 1 of 2. Scan this with Google Authenticator, Microsoft
                Authenticator, 1Password or a similar app.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center">
              <QrCode value={step.uri} />
            </div>
            <details className="text-muted-foreground text-sm">
              <summary className="cursor-pointer">Can't scan it?</summary>
              <p className="mt-2">Enter this key in your app instead:</p>
              <code className="mt-1 block break-all rounded-lg border border-border bg-muted p-3 text-foreground">
                {step.secret}
              </code>
            </details>
            {error && (
              <div className={errorBoxClass} role="alert">
                {error}
              </div>
            )}
            <CodeField id="setup_code" label="6-digit code" name="code" />
            <button
              className={primaryButtonClass}
              disabled={busy}
              type="submit"
            >
              {busy ? "Checking…" : "Turn on"}
            </button>
          </form>
        )}

        {step?.kind === "codes" && (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              run(async () => {
                const result = await replaceRecoveryCodes(
                  readForm(form, "password"),
                  readForm(form, "code")
                );
                onEnabled(result.codes.length);
                setStep({ kind: "done", codes: result.codes });
              }, "Check your password and use a new code from your app.");
            }}
          >
            <DialogHeader>
              <DialogTitle>Two-step verification is on</DialogTitle>
              <DialogDescription>
                Step 2 of 2. Create recovery codes so you can still sign in if
                you lose your phone. Wait for your app to show a new code.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <div className={errorBoxClass} role="alert">
                {error}
              </div>
            )}
            <PasswordField
              autoComplete="current-password"
              id="codes_password"
              label="Account password"
              name="password"
            />
            <CodeField id="codes_code" label="New 6-digit code" name="code" />
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                className={primaryButtonClass}
                disabled={busy}
                type="submit"
              >
                {busy ? "Creating…" : "Create recovery codes"}
              </button>
              <button
                className={cn(outlineButton, "w-full py-3")}
                onClick={() => onOpenChange(false)}
                type="button"
              >
                Skip for now
              </button>
            </div>
          </form>
        )}

        {step?.kind === "done" && (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle>Save your recovery codes</DialogTitle>
              <DialogDescription>You won't see these again.</DialogDescription>
            </DialogHeader>
            <RecoveryCodes codes={step.codes} />
            <button
              className={primaryButtonClass}
              onClick={() => onOpenChange(false)}
              type="button"
            >
              I've saved them
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  children,
  description,
  onConfirm,
  onOpenChange,
  open,
  submitLabel,
  title,
  destructive = false,
}: {
  children?: ReactNode;
  description: string;
  destructive?: boolean;
  onConfirm: (password: string, code: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  submitLabel: string;
  title: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        {children ?? (
          <form
            className="space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              setBusy(true);
              setError("");
              try {
                await onConfirm(
                  readForm(form, "password"),
                  readForm(form, "code")
                );
              } catch {
                setError(
                  "Check your password and your authenticator or recovery code."
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {error && (
              <div className={errorBoxClass} role="alert">
                {error}
              </div>
            )}
            <ConfirmIdentityFields />
            <button
              className={
                destructive
                  ? "w-full rounded-lg bg-destructive px-5 py-3 font-medium text-sm text-white transition hover:bg-destructive/90 disabled:opacity-60"
                  : primaryButtonClass
              }
              disabled={busy}
              type="submit"
            >
              {busy ? "Confirming…" : submitLabel}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TwoStepSettings({
  enabled: initiallyEnabled,
  recoveryCodesRemaining,
}: {
  enabled: boolean;
  recoveryCodesRemaining: number;
}) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [remaining, setRemaining] = useState(recoveryCodesRemaining);
  const [setup, setSetup] = useState<SetupStep | null>(null);
  const [starting, setStarting] = useState(false);
  const [dialog, setDialog] = useState<"replace" | "disable" | null>(null);
  const [newCodes, setNewCodes] = useState<string[]>([]);

  const setupDialog = (
    <SetupDialog
      onEnabled={(codes) => {
        setEnabled(true);
        setRemaining(codes);
      }}
      onOpenChange={(open) => {
        if (!open) {
          if (setup?.kind !== "scan")
            toast.success("Two-step verification is on");
          setSetup(null);
        }
      }}
      setStep={setSetup}
      step={setup}
    />
  );

  if (!enabled) {
    return (
      <>
        <SettingsRow
          action={
            <button
              className={outlineButton}
              disabled={starting}
              onClick={async () => {
                setStarting(true);
                try {
                  const result = await beginMfa();
                  setSetup({
                    kind: "scan",
                    secret: result.secret,
                    uri: result.provisioning_uri,
                  });
                } catch {
                  toast.error("Unable to start authenticator setup.");
                } finally {
                  setStarting(false);
                }
              }}
              type="button"
            >
              Set up
            </button>
          }
          description="Ask for a code from your phone each time you sign in. Administrators should turn this on."
          title="Authenticator app"
        >
          <StatusBadge tone="off">Off</StatusBadge>
        </SettingsRow>
        {setupDialog}
      </>
    );
  }

  return (
    <>
      <SettingsRow
        action={
          <button
            className={dangerButton}
            onClick={() => setDialog("disable")}
            type="button"
          >
            Turn off
          </button>
        }
        description="A code from your phone is required each time you sign in."
        title="Authenticator app"
      >
        <StatusBadge tone="on">On</StatusBadge>
      </SettingsRow>
      {setupDialog}
      <SettingsRow
        action={
          <button
            className={outlineButton}
            onClick={() => {
              setNewCodes([]);
              setDialog("replace");
            }}
            type="button"
          >
            {remaining > 0 ? "Replace" : "Create"}
          </button>
        }
        description={
          remaining > 0
            ? `${remaining} unused ${remaining === 1 ? "code" : "codes"} left. Replacing them cancels the old ones.`
            : "None yet. Create codes so you can sign in if you lose your phone."
        }
        title="Recovery codes"
      />

      <ConfirmDialog
        description="Confirm it's you. Your old recovery codes stop working."
        onConfirm={async (password, code) => {
          const result = await replaceRecoveryCodes(password, code);
          setNewCodes(result.codes);
          setRemaining(result.codes.length);
        }}
        onOpenChange={(open) => setDialog(open ? "replace" : null)}
        open={dialog === "replace"}
        submitLabel="Create new codes"
        title="New recovery codes"
      >
        {newCodes.length > 0 ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle>Save your recovery codes</DialogTitle>
              <DialogDescription>You won't see these again.</DialogDescription>
            </DialogHeader>
            <RecoveryCodes codes={newCodes} />
            <button
              className={primaryButtonClass}
              onClick={() => setDialog(null)}
              type="button"
            >
              I've saved them
            </button>
          </div>
        ) : undefined}
      </ConfirmDialog>

      <ConfirmDialog
        description="Your account will be protected by your password only, and your recovery codes stop working."
        destructive
        onConfirm={async (password, code) => {
          await disableMfa(password, code);
          setEnabled(false);
          setRemaining(0);
          setDialog(null);
          toast.success("Two-step verification is off");
        }}
        onOpenChange={(open) => setDialog(open ? "disable" : null)}
        open={dialog === "disable"}
        submitLabel="Turn off two-step verification"
        title="Turn off two-step verification?"
      />
    </>
  );
}
