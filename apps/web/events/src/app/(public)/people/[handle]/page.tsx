import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { EyeOff, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConnectActions } from "@/components/community/connect-actions";
import { PersonAvatar } from "@/components/community/person-avatar";
import { getPersonByHandle } from "@/data/events-api";
import { CATEGORY_LABELS, INTENT_LABELS, PARISH_LABELS } from "@/domain/labels";

type Params = Promise<{ handle: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const profile = await getPersonByHandle((await params).handle);
  return profile ? { title: profile.name, robots: { index: false } } : {};
}

export default async function ProfilePage({ params }: { params: Params }) {
  const profile = await getPersonByHandle((await params).handle);
  if (!profile) {
    notFound();
  }
  const isSelf = profile.connectionState === "self";
  const { restricted } = profile;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="border-border bg-card rounded-3xl border p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <PersonAvatar
            className="text-heading-sm size-20"
            name={profile.name}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="font-display text-heading-base font-bold tracking-tight">
              {profile.name}
            </h1>
            <p className="text-body-base text-muted-foreground">
              {profile.headline}
            </p>
            <p className="text-caption text-muted-foreground flex items-center gap-1">
              <MapPin className="size-3.5" />
              {PARISH_LABELS[profile.parish]}
            </p>
            {isSelf ? (
              <p className="text-caption text-muted-foreground">
                This is your profile.
              </p>
            ) : null}
          </div>
        </div>
        {isSelf ? null : (
          <div className="mt-6">
            <ConnectActions
              canMessage={profile.canMessage}
              directThreadId={profile.directThreadId}
              handle={profile.handle}
              initialState={profile.connectionState}
              name={profile.name}
            />
          </div>
        )}
      </section>

      {restricted ? (
        <p className="bg-muted text-body flex items-center gap-2 rounded-2xl p-4">
          <EyeOff className="size-5 shrink-0" />
          {profile.name.split(" ")[0]} shares their details with connections
          only.
        </p>
      ) : (
        <>
          {profile.intents.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-display text-body-base font-semibold">
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
            <h2 className="font-display text-body-base font-semibold">About</h2>
            <p className="text-body-base">{profile.bio ?? ""}</p>
          </section>
          <section className="space-y-3">
            <h2 className="font-display text-body-base font-semibold">Into</h2>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <Link
                  className="border-border text-caption hover:border-foreground rounded-full border px-3 py-1"
                  href={`/events?category=${interest}`}
                  key={interest}
                >
                  {CATEGORY_LABELS[interest]}
                </Link>
              ))}
            </div>
          </section>
          {profile.groups.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-display text-body-base font-semibold">
                Groups
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {profile.groups.map((group) => (
                  <li key={group.id}>
                    <Link
                      className="border-border bg-card hover:border-foreground block rounded-2xl border p-3"
                      href={`/groups/${group.slug}`}
                    >
                      <p className="text-body font-medium">{group.name}</p>
                      <p className="text-caption text-muted-foreground truncate">
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
