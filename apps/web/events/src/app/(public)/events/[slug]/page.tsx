import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { BadgeCheck, Clock, MapPin, Repeat, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonAvatar } from "@/components/community/person-avatar";
import { ToggleButton } from "@/components/community/toggle-button";
import { EventCard } from "@/components/discovery/event-card";
import { EventFlyer } from "@/components/discovery/event-flyer";
import { RsvpButton } from "@/components/discovery/rsvp-button";
import { SaveButton } from "@/components/discovery/save-button";
import { ShareActions } from "@/components/discovery/share-actions";
import { setFollowing } from "@/data/actions";
import { getEventBySlug, listEvents } from "@/data/events-api";
import { CATEGORY_LABELS, PARISH_LABELS, priceLabel } from "@/domain/labels";
import { formatEventDate, formatTime } from "@/lib/datetime";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  return event ? { title: event.title, description: event.summary } : {};
}

export default async function EventPage({ params }: { params: Params }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) {
    notFound();
  }

  const { group, organiser } = event;
  const upcoming = await listEvents({ category: event.category });
  const more = upcoming
    .filter((candidate) => candidate.id !== event.id)
    .slice(0, 3);
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue}, Grenada`)}`;

  return (
    <div className="space-y-12">
      <article className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <EventFlyer
            category={event.category}
            className="aspect-[16/9] sm:aspect-[21/9]"
            startsAt={event.startsAt}
          />
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{CATEGORY_LABELS[event.category]}</Badge>
              {event.recurrence ? (
                <Badge variant="outline">
                  <Repeat data-icon="inline-start" />
                  {event.recurrence}
                </Badge>
              ) : null}
            </div>
            <h1 className="font-bold font-display text-heading-md tracking-tight sm:text-heading-lg">
              {event.title}
            </h1>
            <p className="text-body-base text-muted-foreground">
              {event.summary}
            </p>
          </div>

          <dl className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
            <div className="flex gap-3">
              <Clock className="mt-0.5 size-5 shrink-0 text-events-hibiscus" />
              <div>
                <dt className="sr-only">When</dt>
                <dd className="font-medium text-body">
                  {formatEventDate(event.startsAt)}
                </dd>
                <dd className="text-caption text-muted-foreground">
                  Until {formatTime(event.endsAt)} · Grenada time
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-events-hibiscus" />
              <div>
                <dt className="sr-only">Where</dt>
                <dd className="font-medium text-body">{event.venue}</dd>
                <dd className="text-caption text-muted-foreground">
                  {PARISH_LABELS[event.parish]} ·{" "}
                  <a
                    className="underline"
                    href={mapsHref}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open in Maps
                  </a>
                </dd>
              </div>
            </div>
          </dl>

          <section className="space-y-2">
            <h2 className="font-display font-semibold text-heading-sm">
              About
            </h2>
            <p className="max-w-prose whitespace-pre-line text-body-base leading-relaxed">
              {event.description}
            </p>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-baseline justify-between">
              <p className="font-bold font-display text-heading-sm">
                {priceLabel(event)}
              </p>
              <p className="flex items-center gap-1 text-caption text-muted-foreground">
                <Users className="size-4" />
                {event.goingCount} going
              </p>
            </div>
            <RsvpButton
              admission={event.admission}
              initiallyGoing={event.viewerGoing ?? false}
              slug={event.slug}
            />
            <SaveButton
              className="w-full"
              initiallySaved={event.viewerSaved ?? false}
              slug={event.slug}
              title={event.title}
              variant="inline"
            />
            <ShareActions
              icsHref={`/events/${event.slug}/ics`}
              path={`/events/${event.slug}`}
              title={event.title}
            />
          </div>

          {organiser ? (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
              <p className="font-semibold text-caption text-muted-foreground uppercase tracking-wide">
                Hosted by
              </p>
              <div className="flex items-center gap-3">
                <PersonAvatar name={organiser.name} size="lg" />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-medium text-body">
                    <Link
                      className="truncate hover:underline"
                      href={`/o/${organiser.slug}`}
                    >
                      {organiser.name}
                    </Link>
                    {organiser.verified ? (
                      <BadgeCheck
                        aria-label="Verified organiser"
                        className="size-4 shrink-0 text-events-sea"
                      />
                    ) : null}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {organiser.followerCount.toLocaleString("en-US")} followers
                  </p>
                </div>
              </div>
              <p className="text-body text-muted-foreground">{organiser.bio}</p>
              <ToggleButton
                action={setFollowing.bind(null, organiser.slug)}
                activeLabel="Following"
                className="w-full"
                idleLabel="Follow for new events"
                initiallyActive={organiser.viewerFollowing ?? false}
              />
            </div>
          ) : null}

          {group ? (
            <Link
              className="block rounded-2xl bg-events-ink p-5 text-white"
              href={`/groups/${group.slug}`}
            >
              <p className="text-caption text-events-lime">Part of a group</p>
              <p className="mt-1 font-display font-semibold text-body-base">
                {group.name}
              </p>
              <p className="mt-1 text-body text-white/75">{group.tagline}</p>
            </Link>
          ) : null}
        </aside>
      </article>

      {more.length > 0 ? (
        <section className="space-y-5">
          <h2 className="font-bold font-display text-heading-sm">
            More {CATEGORY_LABELS[event.category].toLowerCase()}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((candidate) => (
              <EventCard event={candidate} key={candidate.id} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
