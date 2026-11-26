import { PageHeader } from "@barrelsgd/admin-kit/components/page-header";
import type { AppSubscriptionPublic } from "@barrelsgd/api-client";
import {
  BARRELS_SUPPORT_EMAIL,
  BARRELS_SUPPORT_HREF,
} from "@barrelsgd/ui/lib/support";
import type { Metadata } from "next";
import { StartSubscriptionButton } from "@/components/studio/plan/start-subscription-button";
import { StudioAlert } from "@/components/studio/studio-alert";
import { CARD } from "@/components/studio/studio-ui";
import {
  billingFailure,
  billingFailureNeedsReport,
  PLAN_ADMIN_REQUIRED,
} from "@/lib/billing-errors";
import {
  bookingsSubscription,
  checkoutAction,
  checkoutReturn,
  checkoutReturnCopy,
  planCopy,
  planPriceLabel,
  planState,
  planUsdNote,
} from "@/lib/billing-plan";
import { reportError } from "@/lib/report-error";
import { requireSession, type StudioSession } from "@/lib/session";
import { listAppSubscriptions } from "@/lib/studio-api";
import type { StudioFailure } from "@/lib/studio-errors";
import { loadOrganisation } from "@/lib/studio-page";
import { canManageBookings } from "@/lib/studio-view";

export const metadata: Metadata = {
  title: "Plan & billing",
};

type SubscriptionRead =
  | { ok: true; subscriptions: AppSubscriptionPublic[] }
  | { ok: false; failure: StudioFailure };

/** The person's subscription rows. A failed read is shown as a failure, never as "none". */
async function readSubscriptions(
  session: StudioSession,
  organisationId: string
): Promise<SubscriptionRead> {
  try {
    const subscriptions = await listAppSubscriptions(
      session.accessToken,
      organisationId
    );
    return { ok: true, subscriptions };
  } catch (error) {
    const failure = billingFailure(error);
    if (billingFailureNeedsReport(error)) {
      reportError(error, "studio");
    }
    return { ok: false, failure };
  }
}

interface PlanPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ checkout?: string | string[] }>;
}

/** Owners and admins see the plan; members see why they cannot, and nothing else. */
export default async function PlanPage({
  params,
  searchParams,
}: PlanPageProps) {
  const { orgSlug } = await params;
  const { checkout } = await searchParams;
  const here = `/studio/${orgSlug}/plan`;
  const session = await requireSession(here);

  const org = await loadOrganisation(session, orgSlug, here);
  if (!org.ok) {
    return <StudioAlert backHref="/studio" failure={org.failure} />;
  }
  if (!canManageBookings(org.value.role)) {
    return (
      <StudioAlert
        backHref={`/studio/${orgSlug}/agenda`}
        backLabel="Back to the agenda"
        failure={PLAN_ADMIN_REQUIRED}
      />
    );
  }

  const read = await readSubscriptions(session, org.value.id);
  const returned = checkoutReturn(
    Array.isArray(checkout) ? undefined : checkout
  );
  const subscription = read.ok
    ? bookingsSubscription(read.subscriptions)
    : undefined;
  const state = planState(subscription);
  const action = read.ok ? checkoutAction(state) : null;
  const copy = planCopy(state);

  return (
    <div className="space-y-6">
      <PageHeader title="Plan & billing" />

      {returned ? (
        <p className={`${CARD} text-foreground`} role="status">
          {checkoutReturnCopy(returned)}
        </p>
      ) : null}

      <section aria-labelledby="plan-price" className={`${CARD} space-y-2`}>
        <h2 className="text-foreground text-lg font-semibold" id="plan-price">
          Bookings plan
        </h2>
        <p className="text-xl font-semibold">{planPriceLabel()}</p>
        <p className="text-foreground/80 text-sm">{planUsdNote()}</p>
        <p className="text-foreground/80 text-sm">
          You pay on a secure Stripe checkout page.
        </p>
      </section>

      <section aria-labelledby="plan-status" className={`${CARD} space-y-3`}>
        <h2 className="text-foreground text-lg font-semibold" id="plan-status">
          Status
        </h2>
        {read.ok ? (
          <div className="space-y-1">
            <p className="font-semibold">{copy.heading}</p>
            <p className="text-foreground/80">{copy.detail}</p>
            {copy.supportLink ? (
              <p>
                <a
                  className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4"
                  href={BARRELS_SUPPORT_HREF}
                >
                  Email {BARRELS_SUPPORT_EMAIL}
                </a>
              </p>
            ) : null}
          </div>
        ) : (
          <div
            className="border-destructive/40 bg-destructive/10 space-y-1 rounded-2xl border p-4"
            role="alert"
          >
            <p className="font-semibold">{read.failure.message}</p>
            <p className="text-foreground/80">{read.failure.nextStep}</p>
          </div>
        )}
        {action ? (
          <StartSubscriptionButton label={action.label} orgSlug={orgSlug} />
        ) : null}
      </section>
    </div>
  );
}
