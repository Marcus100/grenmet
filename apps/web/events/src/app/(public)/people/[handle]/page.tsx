import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { EyeOff, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConnectActions } from "@/components/community/connect-actions";
import { PersonAvatar } from "@/components/community/person-avatar";
import {
  canMessage,
  connectionState,
  getProfileByHandle,
  listConnections,
  listGroups,
  listThreads,
} from "@/data/discovery";
import { getViewer } from "@/data/viewer";
import { CATEGORY_LABELS, INTENT_LABELS, PARISH_LABELS } from "@/domain/labels";

type Params = Promise<{ handle: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const profile = await getProfileByHandle((await params).handle);
  return profile ? { title: profile.name, robots: { index: false } } : {};
}

export default async function ProfilePage({ params }: { params: Params }) {
  const profile = await getProfileByHandle((await params).handle);
  if (!profile) {
    notFound();
  }
  const [viewer, connections, groups] = await Promise.all([
    getViewer(),
    listConnections(),
    listGroups(),
  ]);
  const threads = await listThreads(viewer.id);
  const state = connectionState(viewer.id, profile.id, connections);
  const isSelf = state === "self";
  // Private profiles show only name and headline to people outside the network.
  const restricted =
    profile.visibility === "connections" && !isSelf && state !== "connected";
  const allowedToMessage = canMessage(viewer, profile, connections);
  const directThread = threads.find(
    (thread) =>
      thread.kind === "direct" && thread.participantIds.includes(profile.id)
  );
  const theirGroups = groups.filter((group) =>
    profile.groupIds.includes(group.id)
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <PersonAvatar
            className="size-20 text-heading-sm"
            name={profile.name}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="font-bold font-display text-heading-base tracking-tight">
              {profile.name}
            </h1>
            <p className="text-body-base text-muted-foreground">
              {profile.headline}
            </p>
            <p className="flex items-center gap-1 text-caption text-muted-foreground">
              <MapPin className="size-3.5" />
              {PARISH_LABELS[profile.parish]}
            </p>
            {isSelf ? (
              <p className="text-caption text-muted-foreground">
                This is your profile. Visibility:{" "}
                {profile.visibility === "public"
                  ? "public"
                  : "connections only"}
                .
              </p>
            ) : null}
          </div>
        </div>
        {isSelf ? null : (
          <div className="mt-6">
            <ConnectActions
              canMessage={allowedToMessage}
              initialState={state}
              messageHref={directThread ? `/messages/${directThread.id}` : null}
              name={profile.name}
            />
          </div>
        )}
      </section>

      {restricted ? (
        <p className="flex items-center gap-2 rounded-2xl bg-muted p-4 text-body">
          <EyeOff className="size-5 shrink-0" />
          {profile.name.split(" ")[0]} shares their details with connections
          only.
        </p>
      ) : (
        <>
          {profile.intents.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-display font-semibold text-body-base">
                Open to
              </h2>
              <div className="flex flex-wrap gap-2">
                {profile.intents.map((intent) => (
                  <Badge
                    className="bg-events-lime text-events-ink"
                    key={intent}
                    variant="secondary"
                  >
                    {INTENT_LABELS[intent]}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}
          <section className="space-y-2">
            <h2 className="font-display font-semibold text-body-base">About</h2>
            <p className="text-body-base">{profile.bio}</p>
          </section>
          <section className="space-y-3">
            <h2 className="font-display font-semibold text-body-base">Into</h2>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <Link
                  className="rounded-full border border-border px-3 py-1 text-caption hover:border-foreground"
                  href={`/events?category=${interest}`}
                  key={interest}
                >
                  {CATEGORY_LABELS[interest]}
                </Link>
              ))}
            </div>
          </section>
          {theirGroups.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-display font-semibold text-body-base">
                Groups
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {theirGroups.map((group) => (
                  <li key={group.id}>
                    <Link
                      className="block rounded-2xl border border-border bg-card p-3 hover:border-foreground"
                      href={`/groups/${group.slug}`}
                    >
                      <p className="font-medium text-body">{group.name}</p>
                      <p className="truncate text-caption text-muted-foreground">
                        {group.tagline}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
