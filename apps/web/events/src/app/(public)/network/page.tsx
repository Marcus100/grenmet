import type { Metadata } from "next";
import Link from "next/link";
import {
  ConnectButton,
  ConnectionActions,
} from "@/components/community/network-actions";
import { PersonAvatar } from "@/components/community/person-avatar";
import { getMyNetwork } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";

export const metadata: Metadata = { title: "Your network" };

export default async function NetworkPage() {
  await requireViewer("/network");
  const { connections, suggestions } = await getMyNetwork();
  const received = connections.filter((link) => link.state === "received");
  const connected = connections.filter((link) => link.state === "connected");
  const sent = connections.filter((link) => link.state === "sent");

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="font-display text-heading-base sm:text-heading-md font-bold tracking-tight">
          Your network
        </h1>
        <p className="text-body-base text-muted-foreground mt-2">
          People you've met at events and in groups. Only connections and fellow
          group members can message you.
        </p>
      </div>
      {received.length > 0 ? (
        <Section title={`Requests (${received.length})`}>
          {received.map((link) => (
            <Row
              action={
                <ConnectionActions connectionId={link.id} state={link.state} />
              }
              handle={link.person.handle}
              headline={link.headline}
              key={link.id}
              name={link.person.name}
            />
          ))}
        </Section>
      ) : null}
      <Section title={`Connections (${connected.length})`}>
        {connected.length === 0 ? (
          <Empty />
        ) : (
          connected.map((link) => (
            <Row
              action={
                <ConnectionActions connectionId={link.id} state={link.state} />
              }
              handle={link.person.handle}
              headline={link.headline}
              key={link.id}
              name={link.person.name}
            />
          ))
        )}
      </Section>
      {sent.length > 0 ? (
        <Section title="Pending">
          {sent.map((link) => (
            <Row
              action={
                <ConnectionActions connectionId={link.id} state={link.state} />
              }
              handle={link.person.handle}
              headline={link.headline}
              key={link.id}
              name={link.person.name}
            />
          ))}
        </Section>
      ) : null}
      {suggestions.length > 0 ? (
        <Section title="People you may know">
          {suggestions.map((person) => (
            <Row
              action={<ConnectButton handle={person.handle} />}
              handle={person.handle}
              headline={person.headline}
              key={person.handle}
              name={person.name}
            />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Empty() {
  return (
    <li className="text-body text-muted-foreground p-3">
      No one here yet. Go to an event and say hello.
    </li>
  );
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-heading-sm font-semibold">{title}</h2>
      <ul className="divide-border border-border bg-card divide-y rounded-2xl border">
        {children}
      </ul>
    </section>
  );
}

function Row({
  action,
  handle,
  headline,
  name,
}: {
  action: React.ReactNode;
  handle: string;
  headline: string;
  name: string;
}) {
  return (
    <li className="flex items-center gap-3 p-3">
      <PersonAvatar name={name} size="lg" />
      <Link className="min-w-0 flex-1" href={`/people/${handle}`}>
        <p className="text-body truncate font-medium hover:underline">{name}</p>
        <p className="text-caption text-muted-foreground truncate">
          {headline}
        </p>
      </Link>
      {action}
    </li>
  );
}
