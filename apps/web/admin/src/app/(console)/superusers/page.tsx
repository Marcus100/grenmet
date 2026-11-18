import type { Metadata } from "next";
import { Suspense } from "react";
import { StaffOnly } from "@/components/staff-only";
import { InviteSuperuserForm } from "@/components/superuser-invitation-panels";
import { SuperuserInvitationsSection } from "@/components/superuser-invitations-section";
import { requireGate } from "@/lib/staff-gate";
import { superuserNoticeFor } from "@/lib/superuser-invitation-form";

export const metadata: Metadata = { title: "Superusers" };
export const dynamic = "force-dynamic";

export default async function SuperusersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireGate("/superusers");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;
  const { notice: rawNotice } = await searchParams;
  const code = Array.isArray(rawNotice) ? rawNotice[0] : rawNotice;
  const notice = superuserNoticeFor(code);

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Superusers</h1>
        <p className="text-muted-foreground">
          Invite another Barrels administrator by email. They confirm with a
          code sent to that address, then set up an authenticator. Invitations
          work once and end after 24 hours. You need your authenticator and a
          two-step sign-in to send one.
        </p>
      </div>
      {notice ? (
        <p className="text-sm" role="status">
          {notice}
        </p>
      ) : null}
      <section aria-labelledby="invite-heading" className="space-y-3">
        <h2 className="text-lg font-semibold" id="invite-heading">
          Invite superuser
        </h2>
        <InviteSuperuserForm />
      </section>
      <section aria-labelledby="pending-heading" className="space-y-3">
        <h2 className="text-lg font-semibold" id="pending-heading">
          Pending invitations
        </h2>
        <Suspense
          fallback={
            <p className="text-muted-foreground text-sm">
              Loading pending invitations…
            </p>
          }
        >
          <SuperuserInvitationsSection accessToken={gate.accessToken} />
        </Suspense>
      </section>
    </>
  );
}
