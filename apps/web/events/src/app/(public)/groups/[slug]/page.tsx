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
import { setMembership } from "@/data/actions";
import { getGroupBySlug } from "@/data/events-api";
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
  const isMember =
    group.viewerStatus === "member" || group.viewerStatus === "host";
  const pending = group.viewerStatus === "pending";
  const meetups = group.upcoming;
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
        <p className="text-caption font-medium opacity-80">
          {CATEGORY_LABELS[group.category]} · {PARISH_LABELS[group.parish]}
        </p>
        <h1 className="font-display text-heading-md sm:text-heading-lg mt-2 font-bold tracking-tight">
          {group.name}
        </h1>
        <p className="text-body-base mt-2 max-w-xl opacity-90">
          {group.tagline}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <ToggleButton
            action={setMembership.bind(null, group.slug)}
            activeLabel={
              group.joinPolicy === "approval" ? "Request sent" : "Member"
            }
            className="text-events-ink bg-white hover:bg-white/90"
            idleLabel={
              group.joinPolicy === "approval" ? "Request to join" : "Join group"
            }
            initiallyActive={isMember || pending}
          />
          <p className="text-body flex items-center gap-1">
            {group.memberCount} members
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
                  <EventCard event={event} key={event.id} layout="row" />
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
                  className="border-border bg-card flex gap-3 rounded-2xl border p-4"
                  key={announcement.id}
                >
                  <Megaphone className="text-events-hibiscus mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="text-body">{announcement.body}</p>
                    <p className="text-caption text-muted-foreground mt-1">
                      {announcement.author?.name ?? "Member"} ·{" "}
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
            {isMember && group.chatThreadId ? (
              <Link
                className="border-border bg-card hover:border-foreground block rounded-2xl border p-4"
                href={`/messages/${group.chatThreadId}`}
              >
                <p className="text-body font-medium">Open group chat</p>
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
              {group.members.map((member) => (
                <li key={member.handle}>
                  <Link
                    className="border-border bg-card hover:border-foreground flex items-center gap-3 rounded-2xl border p-3"
                    href={`/people/${member.handle}`}
                  >
                    <PersonAvatar name={member.name} />
                    <div className="min-w-0">
                      <p className="text-body truncate font-medium">
                        {member.name}
                        {member.role === "host" ? (
                          <span className="text-caption text-events-sea ml-2">
                            Host
                          </span>
                        ) : null}
                      </p>
                      <p className="text-caption text-muted-foreground truncate">
                        {member.headline}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
        <aside className="border-border bg-card space-y-3 rounded-2xl border p-5 lg:self-start">
          <h2 className="font-display text-body-base font-semibold">About</h2>
          <p className="text-body text-muted-foreground">{group.about}</p>
        </aside>
      </div>
    </div>
  );
}
