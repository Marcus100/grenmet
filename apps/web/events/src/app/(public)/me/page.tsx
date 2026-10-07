import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { GroupCard } from "@/components/community/group-card";
import { PersonAvatar } from "@/components/community/person-avatar";
import { SignOutButton } from "@/components/community/sign-out-button";
import { EventCard } from "@/components/discovery/event-card";
import { getMyPlans } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { formatEventDate } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "My plans",
  robots: { index: false },
};

export default async function MyPlansPage() {
  const viewer = await requireViewer("/me");
  const plans = await getMyPlans();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <PersonAvatar className="size-14" name={viewer.name} />
          <div>
            <h1 className="font-bold font-display text-heading-base tracking-tight">
              My plans
            </h1>
            <p className="text-body text-muted-foreground">
              {plans.going.length} going · {plans.groups.length} groups
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            className={cn(buttonVariants({ variant: "outline" }))}
            href="/welcome"
          >
            Edit interests
          </Link>
          <Link
            className={cn(buttonVariants({ variant: "outline" }))}
            href={`/people/${viewer.handle}`}
          >
            View profile
          </Link>
          <SignOutButton />
        </div>
      </header>

      <Tabs defaultValue="going">
        <TabsList className="w-full sm:w-fit" variant="line">
          <TabsTrigger value="going">Going</TabsTrigger>
          <TabsTrigger value="saved">Saved</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
          <TabsTrigger value="hosting">Hosting</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="going">
          {plans.going.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {plans.going.map((event) => (
                <EventCard event={event} key={event.id} />
              ))}
            </div>
          ) : (
            <p className="text-body text-muted-foreground">No plans yet.</p>
          )}
        </TabsContent>
        <TabsContent className="pt-4" value="saved">
          {plans.saved.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {plans.saved.map((event) => (
                <EventCard event={event} key={event.id} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-border border-dashed p-6 text-center text-body text-muted-foreground">
              Nothing saved yet. Tap the bookmark on any event —{" "}
              <Link className="underline" href="/events">
                browse the calendar
              </Link>
              .
            </p>
          )}
        </TabsContent>
        <TabsContent className="pt-4" value="groups">
          {plans.groups.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.groups.map((group) => (
                <GroupCard
                  group={group}
                  key={group.id}
                  nextMeetup={
                    group.nextMeetupAt
                      ? formatEventDate(group.nextMeetupAt)
                      : null
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-body text-muted-foreground">
              You haven't joined a group yet.{" "}
              <Link className="underline" href="/groups">
                Find one
              </Link>
              .
            </p>
          )}
        </TabsContent>
        <TabsContent className="pt-4" value="following">
          {plans.following.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {plans.following.map((organiser) => (
                <li key={organiser.id}>
                  <Link
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 hover:border-foreground"
                    href={`/o/${organiser.slug}`}
                  >
                    <PersonAvatar name={organiser.name} />
                    <span className="truncate font-medium text-body">
                      {organiser.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted-foreground">
              Follow an organiser to hear about their next event.
            </p>
          )}
        </TabsContent>
        <TabsContent className="pt-4" value="hosting">
          <div className="rounded-2xl border border-border border-dashed p-6 text-center">
            <p className="font-display font-semibold text-body-base">
              Running something?
            </p>
            <p className="mt-1 text-body text-muted-foreground">
              List a fete, a meetup or a class and manage RSVPs and tickets from
              the organiser dashboard.
            </p>
            <Link
              className={cn(buttonVariants({ size: "lg" }), "mt-4")}
              href="/dash/events"
            >
              Open the organiser dashboard
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
