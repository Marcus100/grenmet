import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions";
import { type AccountTab, AccountTabs } from "@/components/account-tabs";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getAppHrefs } from "@/lib/app-links";

interface AccountLayoutProps {
  readonly children: ReactNode;
  readonly current: AccountTab;
  readonly description?: string;
  readonly title: string;
}

export function AccountLayout({
  children,
  current,
  description,
  title,
}: AccountLayoutProps) {
  return (
    <AuthShell
      greeting="Your account"
      hrefs={getAppHrefs()}
      subtitle="Jump into any of your apps."
      wide
    >
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <AuthHeading title={title}>{description}</AuthHeading>
          <form action={signOutAction}>
            <button
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
        <AccountTabs current={current} />
      </div>
      {children}
    </AuthShell>
  );
}

interface SettingsRowProps {
  readonly action?: ReactNode;
  readonly children?: ReactNode;
  readonly description?: ReactNode;
  readonly title: string;
}

/** One setting: title and status on the left, its action on the right. */
export function SettingsRow({
  action,
  children,
  description,
  title,
}: SettingsRowProps) {
  return (
    <div className="space-y-3 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium text-foreground text-sm">{title}</h3>
          {description ? (
            <div className="text-muted-foreground text-sm">{description}</div>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsSection({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <section aria-label={title} className="space-y-1">
      <h2 className="font-mono text-label text-muted-foreground uppercase tracking-widest">
        {title}
      </h2>
      <div className="divide-y divide-border border-border border-b">
        {children}
      </div>
    </section>
  );
}

export function StatusBadge({
  children,
  tone,
}: {
  readonly children: ReactNode;
  readonly tone: "on" | "off" | "neutral";
}) {
  const tones = {
    // Kit green is too dark to read on the dark page; lime is the brand's
    // light "go" colour.
    on: "border-gm-risk-green/30 bg-gm-risk-green/10 text-gm-risk-green dark:border-gm-lime/30 dark:bg-gm-lime/10 dark:text-gm-lime",
    off: "border-border bg-muted text-muted-foreground",
    neutral: "border-border text-muted-foreground",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-medium text-body-sm ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
