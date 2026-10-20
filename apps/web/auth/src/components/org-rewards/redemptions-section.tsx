import type { RewardsOrgEntryPublic } from "@barrelsgd/api-client";
import { Suspense } from "react";
import { confirmRedemptionAction } from "@/app/organisations/[organisationId]/rewards/actions";
import {
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { inputClass } from "@/components/form-styles";
import { listEntries, listRedemptions } from "@/lib/org-rewards";
import { sourceLabel } from "@/lib/org-rewards-options";
import { ActionForm, Field } from "./action-form";
import {
  EmptyNote,
  FormPanel,
  formatWhen,
  SectionFailure,
  SectionSkeleton,
} from "./section-frame";

interface SectionProps {
  readonly organisationId: string;
  readonly token: string;
}

const KIND_LABELS: Record<RewardsOrgEntryPublic["kind"], string> = {
  adjust: "Adjusted",
  earn: "Stamp earned",
  redeem: "Reward redeemed",
  reverse: "Stamp reversed",
};

const STATUS_LABELS: Record<RewardsOrgEntryPublic["status"], string> = {
  confirmed: "Confirmed",
  pending: "Waiting for staff",
  reversed: "Reversed",
};

function EntryRow({ entry }: { readonly entry: RewardsOrgEntryPublic }) {
  const sign = entry.amount > 0 ? "+" : "";
  const source = entry.source_type
    ? ` · ${sourceLabel(entry.source_type)}`
    : "";
  return (
    <SettingsRow
      description={`${formatWhen(entry.created_at)}${source}`}
      title={`${KIND_LABELS[entry.kind]}: ${sign}${entry.amount} ${Math.abs(entry.amount) === 1 ? "stamp" : "stamps"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground text-sm">{entry.program_name}</span>
        <StatusBadge tone={entry.status === "confirmed" ? "on" : "neutral"}>
          {STATUS_LABELS[entry.status]}
        </StatusBadge>
      </div>
    </SettingsRow>
  );
}

export async function RecentEntries({
  area,
  empty,
  load,
  title,
}: {
  readonly area: string;
  readonly empty: string;
  readonly load: () => Promise<{ data: RewardsOrgEntryPublic[] }>;
  readonly title: string;
}) {
  let entries: RewardsOrgEntryPublic[];
  try {
    entries = (await load()).data;
  } catch (error) {
    return (
      <SettingsSection title={title}>
        <SectionFailure area={area} error={error} />
      </SettingsSection>
    );
  }
  return (
    <SettingsSection title={title}>
      {entries.length === 0 ? <EmptyNote>{empty}</EmptyNote> : null}
      {entries.map((entry) => (
        <EntryRow entry={entry} key={entry.id} />
      ))}
    </SettingsSection>
  );
}

export function RedeemForm({
  organisationId,
}: {
  readonly organisationId: string;
}) {
  return (
    <FormPanel
      intro="A customer taps Redeem in their account and gets an 8-character one-time code. Enter it here when they show it, then hand over the reward."
      title="Confirm a redemption"
    >
      <ActionForm
        action={confirmRedemptionAction}
        organisationId={organisationId}
        pendingLabel="Checking…"
        submitLabel="Confirm redemption"
      >
        <Field id="redeem-code" label="Customer's one-time code">
          <input
            autoCapitalize="characters"
            autoComplete="off"
            className={inputClass}
            id="redeem-code"
            maxLength={32}
            name="code"
            required
            spellCheck={false}
            type="text"
          />
        </Field>
      </ActionForm>
    </FormPanel>
  );
}

export function RedemptionsSection({ organisationId, token }: SectionProps) {
  return (
    <div className="space-y-4">
      <RedeemForm organisationId={organisationId} />
      <Suspense fallback={<SectionSkeleton title="recent redemptions" />}>
        <RecentEntries
          area="org-rewards-redemptions"
          empty="No redemptions yet."
          load={() => listRedemptions(token, organisationId)}
          title="Recent redemptions"
        />
      </Suspense>
      <Suspense fallback={<SectionSkeleton title="recent stamp activity" />}>
        <RecentEntries
          area="org-rewards-entries"
          empty="No stamp activity yet. Entries appear here as customers earn stamps."
          load={() => listEntries(token, organisationId)}
          title="Recent stamp activity"
        />
      </Suspense>
      <p className="text-muted-foreground text-sm">
        These lists show activity only. Customers' names and accounts are never
        shown to organisations.
      </p>
    </div>
  );
}
