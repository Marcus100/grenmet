import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { ArrowRight, BellRing, Search } from "lucide-react";
import Link from "next/link";
import { ToggleButton } from "@/components/community/toggle-button";
import { CATEGORY_STYLE } from "@/components/discovery/category-style";
import { EventCard } from "@/components/discovery/event-card";
import { toCardData } from "@/components/discovery/to-card";
import {
  getViewer,
  groupMembers,
  isThisWeekend,
  isTonight,
  listEvents,
  listGroups,
  listProfiles,
  suggestGroups,
} from "@/data/discovery";
import { CATEGORIES, CATEGORY_LABELS, PARISH_LABELS } from "@/domain/labels";

export default async function HomePage() {
  const now = new Date();
  const [events, groups, profiles, viewer] = await Promise.all([
    listEvents({}, now),
    listGroups(),
    listProfiles(),
    getViewer(),
  ]);

  const tonight = events.filter((event) => isTonight(event, now));
  const weekend = events.filter(
    (event) => isThisWeekend(event, now) && !isTonight(event, now)
  );
  const featured = events.filter((event) => event.featured).slice(0, 3);
  const suggested = suggestGroups(viewer, groups).slice(0, 3);
  const [hero, ...restFeatured] = featured;

  return (
    <div className="space-y-14">
      <section className="grid items-center gap-8 pt-2 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <Badge
            className="bg-events-hibiscus-soft text-events-hibiscus-deep"
            variant="secondary"
          >
            {events.length} upcoming across Grenada
          </Badge>
          <h1 className="font-bold font-display text-display tracking-tight">
            Find your people.
            <br />
            <span className="text-events-hibiscus">Find what's on.</span>
          </h1>
          <p className="max-w-lg text-body-base text-muted-foreground">
            Fetes, meetups, food, sport and culture across Grenada, Carriacou
            and Petite Martinique — and the groups and people behind them.
          </p>
          <search>
            <form action="/events" className="flex max-w-lg gap-2">
              <label className="sr-only" htmlFor="home-search">
                Search events
              </label>
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="h-12 w-full rounded-full border border-input bg-card pr-4 pl-10 text-body outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                  id="home-search"
                  name="q"
                  placeholder="Search fetes, meetups, venues…"
                  type="search"
                />
              </div>
              <button
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 rounded-full px-5"
                )}
                type="submit"
              >
                Search
              </button>
            </form>
          </search>
          <div className="flex flex-wrap gap-2">
            {[
              ["Tonight", "/events?when=tonight"],
              ["This weekend", "/events?when=weekend"],
              ["Free", "/events?price=free"],
              ["Meetups", "/groups"],
            ].map(([label, href]) => (
              <Link
                className="rounded-full border border-border bg-card px-3.5 py-1.5 font-medium text-caption hover:border-foreground"
                href={href ?? "/events"}
                key={label}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        {hero ? (
          <div className="relative">
            <EventCard
              event={toCardData(hero, profiles)}
              highlight="Featured"
            />
          </div>
        ) : null}
      </section>

      {tonight.length > 0 ? (
        <Section href="/events?when=tonight" title="Tonight">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {tonight.map((event) => (
              <EventCard
                event={toCardData(event, profiles)}
                highlight="Tonight"
                key={event.id}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section href="/events?when=weekend" title="This weekend">
        {weekend.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {weekend.map((event) => (
              <EventCard event={toCardData(event, profiles)} key={event.id} />
            ))}
          </div>
        ) : (
          <p className="text-body text-muted-foreground">
            Nothing listed yet — check the full calendar.
          </p>
        )}
      </Section>

      <Section title="Browse by vibe">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((category) => {
            const { icon: Icon, tone } = CATEGORY_STYLE[category];
            const count = events.filter(
              (event) => event.category === category
            ).length;
            return (
              <li key={category}>
                <Link
                  className={cn(
                    "flex h-full flex-col justify-between gap-6 rounded-2xl p-4 transition-transform hover:-translate-y-0.5",
                    tone
                  )}
                  href={`/events?category=${category}`}
                >
                  <Icon className="size-6" />
                  <span>
                    <span className="block font-display font-semibold text-body-base">
                      {CATEGORY_LABELS[category]}
                    </span>
                    <span className="text-caption opacity-80">
                      {count} upcoming
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      {restFeatured.length > 0 ? (
        <Section href="/events" title="Don't miss">
          <div className="grid gap-6 sm:grid-cols-2">
            {restFeatured.map((event) => (
              <EventCard
                event={toCardData(event, profiles)}
                key={event.id}
                layout="row"
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section href="/groups" title="Groups you might like">
        <div className="grid gap-4 md:grid-cols-3">
          {suggested.map((group) => {
            const { icon: Icon, tone } = CATEGORY_STYLE[group.category];
            const members = groupMembers(group, profiles).length;
            return (
              <article
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
                key={group.id}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-xl",
                      tone
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-display font-semibold text-body-base">
                      <Link
                        className="hover:underline"
                        href={`/groups/${group.slug}`}
                      >
                        {group.name}
                      </Link>
                    </h3>
                    <p className="text-caption text-muted-foreground">
                      {members} members · {PARISH_LABELS[group.parish]}
                    </p>
                  </div>
                </div>
                <p className="flex-1 text-body text-muted-foreground">
                  {group.tagline}
                </p>
                <ToggleButton
                  activeLabel={
                    group.joinPolicy === "approval" ? "Requested" : "Joined"
                  }
                  className="w-full"
                  idleLabel={
                    group.joinPolicy === "approval"
                      ? "Request to join"
                      : "Join group"
                  }
                />
              </article>
            );
          })}
        </div>
      </Section>

      <section className="flex flex-col items-start gap-4 rounded-3xl bg-events-ink p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-events-lime text-events-ink">
            <BellRing className="size-6" />
          </span>
          <div>
            <h2 className="font-display font-semibold text-heading-sm">
              Grenada this week
            </h2>
            <p className="mt-1 max-w-md text-body text-white/75">
              A Sunday-evening round-up of the week ahead, sent to your inbox or
              WhatsApp.
            </p>
          </div>
        </div>
        <ToggleButton
          activeLabel="Subscribed"
          className="bg-events-lime text-events-ink hover:bg-events-lime/90"
          idleLabel="Subscribe"
        />
      </section>
    </div>
  );
}

function Section({
  children,
  href,
  title,
}: {
  children: React.ReactNode;
  href?: string;
  title: string;
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-bold font-display text-heading-sm tracking-tight sm:text-heading-base">
          {title}
        </h2>
        {href ? (
          <Link
            className="flex items-center gap-1 font-medium text-body text-events-hibiscus-deep hover:underline"
            href={href}
          >
            See all
            <ArrowRight className="size-4" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
