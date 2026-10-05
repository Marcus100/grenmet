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
import { SavedEventsList } from "@/components/discovery/saved-events-list";
import { toCardData } from "@/components/discovery/to-card";
import {
  groupMembers,
  listEvents,
  listGroups,
  listProfiles,
} from "@/data/discovery";
import { requireViewer } from "@/data/viewer";
import { formatEventDate } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "My plans",
  robots: { index: false },
};

export default async function MyPlansPage() {
  const now = new Date();
  const [viewer, events, groups, profiles] = await Promise.all([
    requireViewer("/me"),
    listEvents({}, now),
    listGroups(),
    listProfiles(),
  ]);
  const going = events.filter((event) => event.goingIds.includes(viewer.id));
  const myGroups = groups.filter((group) => viewer.groupIds.includes(group.id));
  const cards = events.map((event) => toCardData(event, profiles));

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
              {going.length} going · {myGroups.length} groups
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
          <TabsTrigger value="hosting">Hosting</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="going">
          {going.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {going.map((event) => (
                <EventCard event={toCardData(event, profiles)} key={event.id} />
              ))}
            </div>
          ) : (
            <p className="text-body text-muted-foreground">No plans yet.</p>
          )}
        </TabsContent>
        <TabsContent className="pt-4" value="saved">
          <SavedEventsList events={cards} />
        </TabsContent>
        <TabsContent className="pt-4" value="groups">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myGroups.map((group) => {
              const next = events.find((event) => event.groupId === group.id);
              return (
                <GroupCard
                  group={group}
                  key={group.id}
                  memberCount={groupMembers(group, profiles).length}
                  nextMeetup={next ? formatEventDate(next.startsAt) : null}
                />
              );
            })}
          </div>
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
              href="/dash/events/new"
            >
              Create an event
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
