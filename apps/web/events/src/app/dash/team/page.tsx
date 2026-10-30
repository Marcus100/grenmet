import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import {
  OrgForbidden,
  OrgUnavailable,
} from "@/components/dash/org-unavailable";
import { TeamFeedbackProvider } from "@/components/dash/team/team-feedback";
import { TeamHelp } from "@/components/dash/team/team-help";
import { TeamMembers } from "@/components/dash/team/team-members";
import { TeamPager } from "@/components/dash/team/team-pager";
import { getManagedOrganiser } from "@/data/events-api";
import { resolveOrgContext } from "@/data/org-context";
import { getTeam } from "@/data/team";
import { requireViewer } from "@/data/viewer";
import { pageParam } from "@/lib/org-orders";
import { getSession } from "@/lib/session";
import { todayUtc } from "@/lib/team-roles";

/** Roles are live and per-organisation; never prerender them. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Team and roles" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  await requireViewer("/dash/team");
  const session = await getSession();
  // Guards a missing id until the roster gains is_self (#821).
  if (!session?.userId) {
    // No signed-in user id means signed out, never an empty id.
    redirect(`/sign-in?returnTo=${encodeURIComponent("/dash/team")}`);
  }
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const context = await resolveOrgContext();
  const team = context.ok
    ? await getTeam(context, { page: pageParam(query.page) })
    : null;
  if (team?.kind === "not-found") {
    notFound();
  }

  if (
    team?.kind === "ok" &&
    team.members.length === 0 &&
    team.count > 0 &&
    team.page > team.totalPages
  ) {
    // A bookmarked page past the end: go to the last page that has members.
    redirect(`/dash/team?page=${team.totalPages}`);
  }

  let body: React.ReactNode;
  if (team?.kind === "ok") {
    body = (
      <TeamFeedbackProvider>
        <TeamHelp />
        <TeamMembers
          bundles={team.bundles}
          members={team.members}
          today={todayUtc(new Date())}
          viewer={team.viewer}
        />
        <TeamPager
          count={team.count}
          page={team.page}
          totalPages={team.totalPages}
        />
      </TeamFeedbackProvider>
    );
  } else if (team?.kind === "forbidden") {
    body = <OrgForbidden what="the team and roles" />;
  } else {
    body = <OrgUnavailable />;
  }

  return (
    <DashShell
      active="team"
      currentOrganiser={managed.organiser.slug}
      eventName={managed.organiser.name}
      isDemo={false}
      organisers={managed.organisers}
    >
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="font-display text-heading-base font-semibold">
            Team and roles
          </h1>
          <p className="text-body text-muted-foreground">
            Who can do what for {managed.organiser.name}.
          </p>
        </div>
        {body}
      </main>
    </DashShell>
  );
}
