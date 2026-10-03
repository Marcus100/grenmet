import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Lock, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonAvatar } from "@/components/community/person-avatar";
import { ToggleButton } from "@/components/community/toggle-button";
import { CATEGORY_STYLE } from "@/components/discovery/category-style";
import { EventCard } from "@/components/discovery/event-card";
import { toCardData } from "@/components/discovery/to-card";
import {
  getGroupBySlug,
  getViewer,
  groupMembers,
  listEvents,
  listProfiles,
  listThreads,
} from "@/data/discovery";
import { CATEGORY_LABELS, PARISH_LABELS } from "@/domain/labels";
import { formatEventDate } from "@/lib/datetime";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const group = await getGroupBySlug((await params).slug);
  return group ? { title: group.name, description: group.tagline } : {};
}

export default async function GroupPage({ params }: { params: Params }) {
  const group = await getGroupBySlug((await params).slug);
  if (!group) {
    notFound();
  }
  const now = new Date();
  const [profiles, events, viewer] = await Promise.all([
    listProfiles(),
    listEvents({}, now),
    getViewer(),
  ]);
  const threads = await listThreads(viewer.id);
  const members = groupMembers(group, profiles);
  const meetups = events.filter((event) => event.groupId === group.id);
  const isMember = viewer.groupIds.includes(group.id);
  const chat = threads.find((thread) => thread.groupId === group.id);
  const nameOf = (id: string) =>
    profiles.find((profile) => profile.id === id)?.name ?? "Member";
  const { icon: Icon, tone } = CATEGORY_STYLE[group.category];

  return (
    <div className="space-y-8">
      <header
        className={cn(
          "relative isolate overflow-hidden rounded-3xl p-6 sm:p-10",
          tone
        )}
      >
        <Icon
          aria-hidden="true"
          className="absolute -right-8 -bottom-10 -z-10 size-56 opacity-15"
          strokeWidth={1.5}
        />
        <p className="font-medium text-caption opacity-80">
          {CATEGORY_LABELS[group.category]} · {PARISH_LABELS[group.parish]}
        </p>
        <h1 className="mt-2 font-bold font-display text-heading-md tracking-tight sm:text-heading-lg">
          {group.name}
        </h1>
        <p className="mt-2 max-w-xl text-body-base opacity-90">
          {group.tagline}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <ToggleButton
            activeLabel={
              group.joinPolicy === "approval" ? "Request sent" : "Member"
            }
            className="bg-white text-events-ink hover:bg-white/90"
            idleLabel={
              group.joinPolicy === "approval" ? "Request to join" : "Join group"
            }
            initiallyActive={isMember}
          />
          <p className="flex items-center gap-1 text-body">
            {members.length} members
            {group.joinPolicy === "approval" ? (
              <span className="flex items-center gap-1">
                · <Lock className="size-4" /> membership reviewed
              </span>
            ) : null}
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <Tabs defaultValue="meetups">
          <TabsList className="w-full sm:w-fit" variant="line">
            <TabsTrigger value="meetups">Meetups</TabsTrigger>
            <TabsTrigger value="announcements">Announcements</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-4" value="meetups">
            {meetups.length > 0 ? (
              <div className="grid gap-6">
                {meetups.map((event) => (
                  <EventCard
                    event={toCardData(event, profiles)}
                    key={event.id}
                    layout="row"
                  />
                ))}
              </div>
            ) : (
              <p className="text-body text-muted-foreground">
                No meetups scheduled yet.
              </p>
            )}
          </TabsContent>
          <TabsContent className="space-y-3 pt-4" value="announcements">
            {group.announcements.length > 0 ? (
              group.announcements.map((announcement) => (
                <article
                  className="flex gap-3 rounded-2xl border border-border bg-card p-4"
                  key={announcement.id}
                >
                  <Megaphone className="mt-0.5 size-5 shrink-0 text-events-hibiscus" />
                  <div>
                    <p className="text-body">{announcement.body}</p>
                    <p className="mt-1 text-caption text-muted-foreground">
                      {nameOf(announcement.authorId)} ·{" "}
                      {formatEventDate(announcement.postedAt)}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-body text-muted-foreground">
                No announcements yet.
              </p>
            )}
          </TabsContent>
          <TabsContent className="pt-4" value="chat">
            {isMember && chat ? (
              <Link
                className="block rounded-2xl border border-border bg-card p-4 hover:border-foreground"
                href={`/messages/${chat.id}`}
              >
                <p className="font-medium text-body">Open group chat</p>
                <p className="mt-1 truncate text-caption text-muted-foreground">
                  {chat.messages.at(-1)?.body}
                </p>
              </Link>
            ) : (
              <p className="text-body text-muted-foreground">
                {isMember
                  ? "The group chat hasn't started yet."
                  : "Join the group to see its chat."}
              </p>
            )}
          </TabsContent>
          <TabsContent className="pt-4" value="members">
            <ul className="grid gap-3 sm:grid-cols-2">
              {members.map((member) => (
                <li key={member.id}>
                  <Link
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 hover:border-foreground"
                    href={`/people/${member.handle}`}
                  >
                    <PersonAvatar name={member.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-body">
                        {member.name}
                        {group.hostIds.includes(member.id) ? (
                          <span className="ml-2 text-caption text-events-sea">
                            Host
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-caption text-muted-foreground">
                        {member.headline}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
        <aside className="space-y-3 rounded-2xl border border-border bg-card p-5 lg:self-start">
          <h2 className="font-display font-semibold text-body-base">About</h2>
          <p className="text-body text-muted-foreground">{group.about}</p>
        </aside>
      </div>
    </div>
  );
}
