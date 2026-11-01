import { Badge } from "@barrelsgd/ui/components/ui/badge";
import type { ReactNode } from "react";

/** Shown in place of a section the person cannot read. Never hidden silently. */
export function PayrollNoAccess({ what }: { what: string }) {
  return (
    <section
      aria-label={what}
      className="rounded-xl border bg-card p-4 text-sm"
    >
      <p className="font-medium">No access to {what.toLowerCase()}</p>
      <p className="text-muted-foreground">
        Your account does not have the payroll permission this needs. Ask the
        owner to assign it if you need it.
      </p>
    </section>
  );
}

/** Two-step verification is required before this section loads or saves. */
export function PayrollMfaRequired({
  securityUrl,
  what,
}: {
  securityUrl: string;
  what: string;
}) {
  return (
    <section
      aria-label={what}
      className="rounded-xl border border-warning bg-card p-4 text-sm"
      role="alert"
    >
      <p className="font-medium">Two-step verification is needed</p>
      <p className="text-muted-foreground">
        {what} needs a fresh sign-in with your authenticator app or a recovery
        code. Confirm it in account security, then sign in again and open this
        page.
      </p>
      <p className="mt-2 flex flex-wrap gap-4">
        <a className="text-info underline" href={securityUrl}>
          Open account security
        </a>
        <a className="text-info underline" href="/signin">
          Sign in again
        </a>
      </p>
    </section>
  );
}

export function PayrollLoading({ what }: { what: string }) {
  return (
    <p className="text-muted-foreground text-sm" role="status">
      Loading {what.toLowerCase()}…
    </p>
  );
}

export function PayrollEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
      {children}
    </p>
  );
}

/** Inline failure from a button press. Never a raw code. */
export function PayrollProblem({
  children,
  securityUrl,
}: {
  children: ReactNode;
  securityUrl?: string;
}) {
  return (
    <p
      className="rounded-lg border border-destructive p-3 text-destructive text-sm"
      role="alert"
    >
      {children}
      {securityUrl ? (
        <>
          {" "}
          <a className="underline" href={securityUrl}>
            Open account security
          </a>
        </>
      ) : null}
    </p>
  );
}

export function ProvisionalBadge() {
  return <Badge variant="light-warning">PROVISIONAL</Badge>;
}

export function RuleStateBadge({ state }: { state: string }) {
  return state === "PROVISIONAL" ? (
    <ProvisionalBadge />
  ) : (
    <Badge variant="light-success">Confirmed</Badge>
  );
}
