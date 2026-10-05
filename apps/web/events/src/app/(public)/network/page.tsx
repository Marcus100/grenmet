import type { Metadata } from "next";
import Link from "next/link";
import { PersonAvatar } from "@/components/community/person-avatar";
import { ToggleButton } from "@/components/community/toggle-button";
import {
  connectionState,
  listConnections,
  listProfiles,
} from "@/data/discovery";
import { requireViewer } from "@/data/viewer";
import type { Profile } from "@/domain/types";

export const metadata: Metadata = { title: "Your network" };

export default async function NetworkPage() {
  const [viewer, connections, profiles] = await Promise.all([
    requireViewer("/network"),
    listConnections(),
    listProfiles(),
  ]);
  const others = profiles.filter((profile) => profile.id !== viewer.id);
  const byState = (state: ReturnType<typeof connectionState>) =>
    others.filter(
      (profile) => connectionState(viewer.id, profile.id, connections) === state
    );

  const received = byState("received");
  const connected = byState("connected");
  const sent = byState("sent");
  // Suggestions: share a group or an interest, not yet linked.
  const suggestions = byState("none").filter(
    (profile) =>
      profile.groupIds.some((id) => viewer.groupIds.includes(id)) ||
      profile.interests.some((interest) => viewer.interests.includes(interest))
  );

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="font-bold font-display text-heading-base tracking-tight sm:text-heading-md">
          Your network
        </h1>
        <p className="mt-2 text-body-base text-muted-foreground">
          People you've met at events and in groups. Only connections and fellow
          group members can message you.
        </p>
      </div>
      {received.length > 0 ? (
        <PeopleSection
          people={received}
          title={`Requests (${received.length})`}
        >
          {() => <ToggleButton activeLabel="Accepted" idleLabel="Accept" />}
        </PeopleSection>
      ) : null}
      <PeopleSection
        people={connected}
        title={`Connections (${connected.length})`}
      />
      {sent.length > 0 ? (
        <PeopleSection people={sent} title="Pending">
          {() => (
            <span className="text-caption text-muted-foreground">
              Request sent
            </span>
          )}
        </PeopleSection>
      ) : null}
      {suggestions.length > 0 ? (
        <PeopleSection people={suggestions} title="People you may know">
          {() => <ToggleButton activeLabel="Requested" idleLabel="Connect" />}
        </PeopleSection>
      ) : null}
    </div>
  );
}

function PeopleSection({
  children,
  people,
  title,
}: {
  children?: (person: Profile) => React.ReactNode;
  people: readonly Profile[];
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display font-semibold text-heading-sm">{title}</h2>
      {people.length === 0 ? (
        <p className="text-body text-muted-foreground">
          No one here yet. Go to an event and say hello.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {people.map((person) => (
            <li className="flex items-center gap-3 p-3" key={person.id}>
              <PersonAvatar name={person.name} size="lg" />
              <Link
                className="min-w-0 flex-1"
                href={`/people/${person.handle}`}
              >
                <p className="truncate font-medium text-body hover:underline">
                  {person.name}
                </p>
                <p className="truncate text-caption text-muted-foreground">
                  {person.headline}
                </p>
              </Link>
              {children?.(person)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
