import type { Metadata } from "next";
import { GroupCard } from "@/components/community/group-card";
import { listGroups } from "@/data/events-api";
import { formatEventDate } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Groups & meetups",
  description:
    "Run clubs, tech meetups, supper clubs and creative circles in Grenada.",
};

export default async function GroupsPage() {
  const groups = await listGroups();
  const mine = groups.filter((group) => group.viewerStatus);
  const others = groups.filter((group) => !group.viewerStatus);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-bold font-display text-heading-base tracking-tight sm:text-heading-md">
          Groups & meetups
        </h1>
        <p className="mt-2 max-w-xl text-body-base text-muted-foreground">
          The communities behind the calendar. Join one to get its meetups,
          announcements and group chat.
        </p>
      </div>
      {mine.length > 0 ? (
        <section className="space-y-4">
          <h2 className="font-display font-semibold text-heading-sm">
            Your groups
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((group) => (
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
        </section>
      ) : null}
      <section className="space-y-4">
        <h2 className="font-display font-semibold text-heading-sm">
          Discover groups
        </h2>
        {others.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((group) => (
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
            No groups to discover yet.
          </p>
        )}
      </section>
    </div>
  );
}
