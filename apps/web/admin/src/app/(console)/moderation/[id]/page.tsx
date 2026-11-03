import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveAction,
  rejectAction,
} from "@/app/(console)/moderation/actions";
import { ApproveForm, RejectForm } from "@/components/moderation-decision";
import {
  DecisionNotice,
  HistoryTimeline,
  StatusBadge,
  stamp,
} from "@/components/moderation-panels";
import { StaffOnly } from "@/components/staff-only";
import { getVerificationCase } from "@/lib/moderation-api";
import { moderationNoticeFor } from "@/lib/moderation-form";
import { parseOrganisationId } from "@/lib/organisation-form";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Verification case" };
export const dynamic = "force-dynamic";

/** A success banner only shows when the case really is in that state. */
function noticeFor(code: string | undefined, status: string) {
  if ((code === "approved" || code === "rejected") && code !== status) {
    return;
  }
  return moderationNoticeFor(code);
}

export default async function ModerationCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: rawId } = await params;
  const id = parseOrganisationId(rawId);
  if (!id) notFound();
  const gate = await requireGate(`/moderation/${encodeURIComponent(id)}`);
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  const { notice: rawNotice } = await searchParams;
  const noticeCode = Array.isArray(rawNotice) ? rawNotice[0] : rawNotice;

  let verification: Awaited<ReturnType<typeof getVerificationCase>>;
  try {
    verification = await getVerificationCase(gate.accessToken, id);
  } catch (error) {
    if (isAuthApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const notice = noticeFor(noticeCode, verification.verification_status);
  const counts = Object.entries(verification.listing_counts);

  return (
    <>
      <p className="text-sm">
        <Link
          className="inline-flex min-h-11 items-center underline"
          href="/moderation"
        >
          Back to the queue
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{verification.name}</h1>
        <StatusBadge status={verification.verification_status} />
      </div>

      {notice ? (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          role={notice.tone === "problem" ? "alert" : "status"}
        >
          {notice.tone === "problem" ? "Problem: " : ""}
          {notice.text}
        </p>
      ) : null}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Organiser</dt>
        <dd className="font-mono">{verification.organiser_slug}</dd>
        <dt className="text-muted-foreground">Requested</dt>
        <dd>{stamp(verification.requested_at)}</dd>
        <dt className="text-muted-foreground">Decided</dt>
        <dd>
          {verification.decided_at ? stamp(verification.decided_at) : "Not yet"}
        </dd>
        <dt className="text-muted-foreground">Last reason</dt>
        <dd>{verification.verification_reason ?? "None"}</dd>
        <dt className="text-muted-foreground">Organisation</dt>
        <dd>
          <Link
            className="inline-flex min-h-11 items-center underline"
            href={`/organisations/${encodeURIComponent(verification.organisation_id)}`}
          >
            Open organisation
          </Link>
        </dd>
      </dl>

      <section aria-labelledby="about-heading" className="space-y-1">
        <h2 className="font-medium" id="about-heading">
          About the organiser
        </h2>
        <p className="text-sm whitespace-pre-line">
          {verification.bio || "No description given."}
        </p>
      </section>

      <section aria-labelledby="owners-heading" className="space-y-1">
        <h2 className="font-medium" id="owners-heading">
          Owners who will be emailed
        </h2>
        {verification.owners.length === 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            No active owners or admins.
          </p>
        ) : (
          <ul className="text-sm">
            {verification.owners.map((owner) => (
              <li key={`${owner.name}-${owner.role}`}>
                {owner.name} ({owner.role})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="listings-heading" className="space-y-1">
        <h2 className="font-medium" id="listings-heading">
          Listings
        </h2>
        {counts.length === 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            No listings yet.
          </p>
        ) : (
          <ul className="text-sm">
            {counts.map(([name, count]) => (
              <li key={name}>
                <span className="capitalize">{name}</span>: {count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Decision
        decidedAt={verification.decided_at}
        id={id}
        reason={verification.verification_reason}
        status={verification.verification_status}
      />
      <HistoryTimeline events={verification.history} />
    </>
  );
}

function Decision({
  decidedAt,
  id,
  reason,
  status,
}: {
  decidedAt?: string | null;
  id: string;
  reason?: string | null;
  status: "pending" | "approved" | "rejected";
}) {
  if (status === "approved") {
    return (
      <DecisionNotice title="Decision">
        This organiser is approved. To withdraw an approval, use Unverify on the
        organisation page.
      </DecisionNotice>
    );
  }
  if (status === "rejected") {
    return (
      <section aria-labelledby="decision-heading" className="space-y-3">
        <h2 className="font-medium" id="decision-heading">
          Decision
        </h2>
        <p className="text-muted-foreground text-sm">
          Rejected earlier{decidedAt ? ` on ${stamp(decidedAt)}` : ""}:{" "}
          {reason ?? "no reason recorded"}. Approving overrides that rejection;
          the organiser can then publish.
        </p>
        <ApproveForm action={approveAction} organisationId={id} />
      </section>
    );
  }
  return (
    <section aria-labelledby="decision-heading" className="space-y-3">
      <h2 className="font-medium" id="decision-heading">
        Decision
      </h2>
      <p className="text-muted-foreground text-sm">
        Only a superuser signed in with an authenticator can decide. Without
        that you can read the case, and a decision is refused with steps to fix
        it. A decision is final here: repeating it changes nothing.
      </p>
      <ApproveForm action={approveAction} organisationId={id} />
      <RejectForm action={rejectAction} organisationId={id} />
    </section>
  );
}
