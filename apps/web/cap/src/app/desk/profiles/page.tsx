import type { CapProfilePublic } from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata } from "next";
import {
  DeskRefused,
  DeskUnavailable,
  grenadaTime,
} from "@/components/desk/desk-panels";
import { GmsCatalogueProvider } from "@/components/desk/gms-catalogue";
import { ProfileAlertStarter } from "@/components/desk/profile-alert-starter";
import { ProfileApproval } from "@/components/desk/profile-approval";
import { ProfileVersionDrafter } from "@/components/desk/profile-editor";
import { getGmsCatalogue, listHazardProfiles } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import type { DeskPermissions } from "@/lib/desk/permissions";
import {
  alertStartCheck,
  groupProfiles,
  type ProfileHistory,
  versionDraftCheck,
} from "@/lib/desk/profiles";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Hazard profiles" };
export const dynamic = "force-dynamic";

const NEW_PROFILE_INTRO =
  "A new profile starts from a flood set with empty wording. Nothing is filled in for you: thresholds and response text come from GMS. Saving creates version 1 as a draft that needs approval before any warning can use it.";

type Permissions = Pick<
  DeskPermissions,
  "approve" | "create" | "libraryManage"
>;

function StateBadge({ profile }: { profile: CapProfilePublic }) {
  return (
    <span className="text-caption rounded-full border px-2 py-0.5 font-medium">
      Version {profile.version}:{" "}
      {profile.state === "APPROVED" ? "approved" : "draft, not approved"}
    </span>
  );
}

function VersionLine({ profile }: { profile: CapProfilePublic }) {
  return (
    <li className="text-body-sm space-y-1">
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

/** Wording for the editor's intro, from the version it will start from. */
function changeIntro(latest: CapProfilePublic): string {
  const next = latest.version + 1;
  if (latest.state === "DRAFT") {
    return `Saving adds version ${next} as a new draft. Version ${latest.version} stays in the history unchanged. Version ${next} needs approval before any warning can use it.`;
  }
  return `Approved versions are never changed. Saving adds version ${next} as a new draft that needs approval before any warning can use it.`;
}

function ProfileCard({
  group,
  userId,
  permissions,
  takenKeys,
}: {
  group: ProfileHistory;
  permissions: Permissions;
  userId: string;
  takenKeys: readonly string[];
}) {
  const latest = group.latest;
  return (
    <article
      aria-labelledby={`profile-${group.key}`}
      className="space-y-4 rounded-lg border p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold" id={`profile-${group.key}`}>
          {group.name}
        </h2>
        <code className="text-caption text-muted-foreground">{group.key}</code>
        <StateBadge profile={latest} />
      </header>
      {latest.approval_errors.length > 0 && latest.state === "DRAFT" ? (
        <div className="border-warning bg-warning-soft text-body-sm rounded-md border p-3">
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
      <section className="space-y-2">
        <h3 className="font-medium">
          {latest.state === "DRAFT" ? "Edit this draft" : "Change this profile"}
        </h3>
        <ProfileVersionDrafter
          buttonLabel={
            latest.state === "DRAFT" ? "Edit draft" : "Draft new version"
          }
          check={versionDraftCheck(permissions)}
          intro={changeIntro(latest)}
          source={{
            definition: latest.definition,
            key: group.key,
            version: latest.version,
          }}
          takenKeys={takenKeys}
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">Start a warning from this version</h3>
        <ProfileAlertStarter
          check={alertStartCheck(latest, permissions)}
          profile={latest}
        />
      </section>
      <details>
        <summary className="text-info cursor-pointer underline">
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

/**
 * Every hazard profile and its versions. Approval is offered per version, and
 * a changed profile is always saved as a new draft that needs approval.
 */
export default async function HazardProfilesPage() {
  const gate = await requireDeskGate("/desk/profiles");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;

  let groups: ProfileHistory[];
  let catalogue: Awaited<ReturnType<typeof getGmsCatalogue>>;
  try {
    const [profiles, loadedCatalogue] = await Promise.all([
      listHazardProfiles(gate.accessToken),
      getGmsCatalogue(gate.accessToken),
    ]);
    groups = groupProfiles(profiles);
    catalogue = loadedCatalogue;
  } catch (error) {
    if (isAuthApiError(error) && error.status === 403) {
      return <DeskRefused email={gate.email} />;
    }
    reportError(error, "cap-desk-profiles");
    return <DeskUnavailable what="The hazard profiles" />;
  }

  const takenKeys = groups.map((group) => group.key);

  return (
    <GmsCatalogueProvider catalogue={catalogue}>
      <section className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Hazard profiles</h1>
          <p className="text-body-sm text-muted-foreground">
            A profile sets the wording, impacts and the impact-based matrix for
            one hazard. Approved profiles drive the severity and wording of new
            warnings. To change a profile, save a new draft version. Saved
            versions are never changed in place, and every new version needs
            approval.
          </p>
        </header>
        <section
          aria-labelledby="new-profile"
          className="space-y-3 rounded-lg border p-4"
        >
          <h2 className="text-lg font-semibold" id="new-profile">
            Start a new hazard profile
          </h2>
          <ProfileVersionDrafter
            buttonLabel="Start a new profile"
            check={versionDraftCheck(gate.permissions)}
            intro={NEW_PROFILE_INTRO}
            source={null}
            takenKeys={takenKeys}
          />
        </section>
        {groups.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border p-6">
            No hazard profiles have been saved yet.
          </p>
        ) : (
          groups.map((group) => (
            <ProfileCard
              group={group}
              key={group.key}
              permissions={gate.permissions}
              takenKeys={takenKeys}
              userId={gate.userId}
            />
          ))
        )}
      </section>
    </GmsCatalogueProvider>
  );
}
