import type { CapProfilePublic } from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata } from "next";
import {
  DeskRefused,
  DeskUnavailable,
  grenadaTime,
} from "@/components/desk/desk-panels";
import { ProfileApproval } from "@/components/desk/profile-approval";
import { listHazardProfiles } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { groupProfiles, type ProfileHistory } from "@/lib/desk/profiles";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Hazard profiles" };
export const dynamic = "force-dynamic";

function StateBadge({ profile }: { profile: CapProfilePublic }) {
  return (
    <span className="rounded-full border px-2 py-0.5 font-medium text-caption">
      Version {profile.version}:{" "}
      {profile.state === "APPROVED" ? "approved" : "draft, not approved"}
    </span>
  );
}

function VersionLine({ profile }: { profile: CapProfilePublic }) {
  return (
    <li className="space-y-1 text-body-sm">
      <span className="font-medium">Version {profile.version}</span> ·{" "}
      {profile.state === "APPROVED" ? "approved" : "draft"} · saved{" "}
      {grenadaTime(profile.created_at)}
      {profile.approved_at ? (
        <>
          {" "}
          · approved {grenadaTime(profile.approved_at)} by user{" "}
          <code className="break-all">{profile.approved_by}</code>
        </>
      ) : null}
    </li>
  );
}

function ProfileCard({
  group,
  userId,
  permissions,
}: {
  group: ProfileHistory;
  permissions: { approve: boolean; libraryManage: boolean };
  userId: string;
}) {
  const latest = group.latest;
  return (
    <article
      aria-labelledby={`profile-${group.key}`}
      className="space-y-3 rounded-lg border p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-lg" id={`profile-${group.key}`}>
          {group.name}
        </h2>
        <code className="text-caption text-muted-foreground">{group.key}</code>
        <StateBadge profile={latest} />
      </header>
      {latest.approval_errors.length > 0 && latest.state === "DRAFT" ? (
        <div className="rounded-md border border-warning bg-warning-soft p-3 text-body-sm">
          <p className="font-medium">Not ready to approve:</p>
          <ul className="list-disc pl-5">
            {latest.approval_errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {latest.state === "DRAFT" ? (
        <ProfileApproval
          permissions={permissions}
          profile={latest}
          userId={userId}
        />
      ) : null}
      <details>
        <summary className="cursor-pointer text-info underline">
          Version history ({group.versions.length})
        </summary>
        <ul className="mt-2 space-y-2">
          {group.versions.map((version) => (
            <VersionLine key={version.id} profile={version} />
          ))}
        </ul>
      </details>
    </article>
  );
}

/** Every hazard profile and its versions. Approval is offered per version. */
export default async function HazardProfilesPage() {
  const gate = await requireDeskGate("/desk/profiles");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;

  let groups: ProfileHistory[];
  try {
    groups = groupProfiles(await listHazardProfiles(gate.accessToken));
  } catch (error) {
    if (isAuthApiError(error) && error.status === 403) {
      return <DeskRefused email={gate.email} />;
    }
    reportError(error, "cap-desk-profiles");
    return <DeskUnavailable what="The hazard profiles" />;
  }

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">Hazard profiles</h1>
        <p className="text-body-sm text-muted-foreground">
          A profile sets the wording, impacts and the impact-based matrix for
          one hazard. Approved profiles drive the severity and wording of new
          warnings. Editing profiles is still done in GAA Admin.
        </p>
      </header>
      {groups.length === 0 ? (
        <p className="rounded-lg border p-6 text-muted-foreground">
          No hazard profiles have been saved yet.
        </p>
      ) : (
        groups.map((group) => (
          <ProfileCard
            group={group}
            key={group.key}
            permissions={gate.permissions}
            userId={gate.userId}
          />
        ))
      )}
    </section>
  );
}
