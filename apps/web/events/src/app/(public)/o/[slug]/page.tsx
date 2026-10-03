import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PersonAvatar } from "@/components/community/person-avatar";
import { ToggleButton } from "@/components/community/toggle-button";
import { EventCard } from "@/components/discovery/event-card";
import { toCardData } from "@/components/discovery/to-card";
import {
  getOrganiserBySlug,
  listOrganiserEvents,
  listProfiles,
} from "@/data/discovery";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const organiser = await getOrganiserBySlug((await params).slug);
  return organiser ? { title: organiser.name, description: organiser.bio } : {};
}

export default async function OrganiserPage({ params }: { params: Params }) {
  const organiser = await getOrganiserBySlug((await params).slug);
  if (!organiser) {
    notFound();
  }
  const now = new Date();
  const [events, profiles] = await Promise.all([
    listOrganiserEvents(organiser.id, now),
    listProfiles(),
  ]);
  const upcoming = events.filter((event) => new Date(event.endsAt) > now);
  const past = events
    .filter((event) => new Date(event.endsAt) <= now)
    .toReversed();

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 rounded-3xl bg-events-ink p-6 text-white sm:flex-row sm:items-center sm:p-10">
        <PersonAvatar
          className="size-20 ring-4 ring-white/10"
          name={organiser.name}
        />
        <div className="flex-1 space-y-2">
          <h1 className="flex items-center gap-2 font-bold font-display text-heading-md tracking-tight">
            {organiser.name}
            {organiser.verified ? (
              <BadgeCheck
                aria-label="Verified organiser"
                className="size-6 text-events-lime"
              />
            ) : null}
          </h1>
          <p className="max-w-xl text-body-base text-white/80">
            {organiser.bio}
          </p>
          <p className="text-caption text-white/60">
            {organiser.followerCount.toLocaleString("en-US")} followers ·{" "}
            {upcoming.length} upcoming
          </p>
        </div>
        <ToggleButton
          activeLabel="Following"
          className="bg-events-lime text-events-ink hover:bg-events-lime/90"
          idleLabel="Follow"
        />
      </header>

      <section className="space-y-5">
        <h2 className="font-bold font-display text-heading-sm">Upcoming</h2>
        {upcoming.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event) => (
              <EventCard event={toCardData(event, profiles)} key={event.id} />
            ))}
          </div>
        ) : (
          <p className="text-body text-muted-foreground">
            Nothing scheduled. Follow to hear about the next one.
          </p>
        )}
      </section>

      {past.length > 0 ? (
        <section className="space-y-5">
          <h2 className="font-bold font-display text-heading-sm">
            Past events
          </h2>
          <div className="grid gap-6 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((event) => (
              <EventCard event={toCardData(event, profiles)} key={event.id} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
