import type {
  PrintixEventPublic,
  PrintixOrganiserOrganisation,
} from "@barrelsgd/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChooseOrganisation } from "@/organiser/choose-organisation";
import { type Problem, problemMessage } from "@/organiser/errors";
import { EventScreen } from "@/organiser/event-screen";
import { EventsScreen } from "@/organiser/events-screen";
import { OrganiserHeader } from "@/organiser/header";
import { listOrganisations } from "@/organiser/organiser-api";
import { browserSessionStorage, OrganiserSession } from "@/organiser/session";
import { SignInScreen } from "@/organiser/sign-in-screen";
import { ALERT, PAGE } from "@/organiser/styles";

type View =
  | { readonly kind: "events" }
  | { readonly kind: "event"; readonly event: PrintixEventPublic };

type Phase =
  | { readonly kind: "signed-out"; readonly notice: string | null }
  | {
      readonly kind: "choosing";
      readonly organisations: PrintixOrganiserOrganisation[] | null;
      readonly problem: Problem | null;
    }
  | {
      readonly kind: "working";
      readonly organisation: PrintixOrganiserOrganisation;
      readonly organisations: PrintixOrganiserOrganisation[];
      readonly view: View;
    };

const SESSION_ENDED_NOTICE = problemMessage({ kind: "session-ended" });

interface OrganiserAppProps {
  /** The API origin (VITE_API_URL). Empty means the build is not connected. */
  readonly apiOrigin: string;
}

/**
 * The organiser screens at /organiser: sign in, choose an organisation, then
 * its events and each event's counts. Laptop first, and usable on a phone.
 */
export function OrganiserApp({ apiOrigin }: OrganiserAppProps) {
  if (!apiOrigin) {
    return (
      <main className={PAGE}>
        <h1 className="text-2xl font-semibold tracking-tight">
          Printix organiser
        </h1>
        <p className={ALERT} role="alert">
          The organiser screens are not connected to their server, so nothing
          can be shown or signed in. Ask Barrels to fix the scanner.
        </p>
      </main>
    );
  }
  return <ConnectedOrganiser apiOrigin={apiOrigin} />;
}

/**
 * The first organisation this tab should open: the one it remembers, or the
 * only one there is. Several with none remembered: the picker.
 */
function startingPhase(
  session: OrganiserSession,
  organisations: PrintixOrganiserOrganisation[]
): Phase {
  const remembered = organisations.find(
    (organisation) => organisation.id === session.chosenOrganisation()
  );
  const only = organisations.length === 1 ? organisations[0] : undefined;
  const chosen = remembered ?? only;
  if (!chosen) {
    return { kind: "choosing", organisations, problem: null };
  }
  session.chooseOrganisation(chosen.id);
  return {
    kind: "working",
    organisation: chosen,
    organisations,
    view: { kind: "events" },
  };
}

function ConnectedOrganiser({ apiOrigin }: { readonly apiOrigin: string }) {
  const [session] = useState(
    () =>
      new OrganiserSession({
        origin: apiOrigin,
        storage: browserSessionStorage(),
      })
  );
  const [phase, setPhase] = useState<Phase>(() =>
    session.hasSession()
      ? { kind: "choosing", organisations: null, problem: null }
      : { kind: "signed-out", notice: null }
  );
  const started = useRef(false);

  const enterOrganisations = useCallback(async () => {
    setPhase({ kind: "choosing", organisations: null, problem: null });
    const outcome = await listOrganisations(session);
    if (outcome.ok) {
      setPhase(startingPhase(session, outcome.value));
    } else if (outcome.problem.kind === "session-ended") {
      setPhase({ kind: "signed-out", notice: SESSION_ENDED_NOTICE });
    } else {
      setPhase({
        kind: "choosing",
        organisations: null,
        problem: outcome.problem,
      });
    }
  }, [session]);

  // A reload keeps the session of this tab: renew it and look up the organisations.
  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    if (session.hasSession()) {
      enterOrganisations();
    }
  }, [session, enterOrganisations]);

  // The server ended the session (a refresh was refused): back to sign-in.
  useEffect(
    () =>
      session.onEnded(() =>
        setPhase({ kind: "signed-out", notice: SESSION_ENDED_NOTICE })
      ),
    [session]
  );

  const signOut = useCallback(async () => {
    await session.signOut();
    setPhase({ kind: "signed-out", notice: null });
  }, [session]);

  const pick = useCallback(
    (
      organisation: PrintixOrganiserOrganisation,
      organisations: PrintixOrganiserOrganisation[]
    ) => {
      session.chooseOrganisation(organisation.id);
      setPhase({
        kind: "working",
        organisation,
        organisations,
        view: { kind: "events" },
      });
    },
    [session]
  );

  const email = session.personEmail();

  if (phase.kind === "signed-out") {
    return (
      <SignInScreen
        notice={phase.notice}
        onSignedIn={() => {
          enterOrganisations();
        }}
        session={session}
      />
    );
  }

  if (phase.kind === "choosing") {
    return (
      <main className={PAGE}>
        <OrganiserHeader
          email={email}
          onSignOut={() => {
            signOut();
          }}
          onSwitch={null}
          organisationName={null}
        />
        <ChooseOrganisation
          onPick={(organisation) =>
            pick(organisation, phase.organisations ?? [organisation])
          }
          onRetry={() => {
            enterOrganisations();
          }}
          organisations={phase.organisations}
          problem={phase.problem}
        />
      </main>
    );
  }

  const { organisation, organisations, view } = phase;
  return (
    <main className={PAGE}>
      <OrganiserHeader
        email={email}
        onSignOut={() => {
          signOut();
        }}
        onSwitch={
          organisations.length > 1
            ? () =>
                setPhase({
                  kind: "choosing",
                  organisations,
                  problem: null,
                })
            : null
        }
        organisationName={organisation.name}
      />
      {view.kind === "events" ? (
        <EventsScreen
          onOpen={(event) =>
            setPhase({
              kind: "working",
              organisation,
              organisations,
              view: { kind: "event", event },
            })
          }
          organisation={organisation}
          session={session}
        />
      ) : (
        <EventScreen
          event={view.event}
          onBack={() =>
            setPhase({
              kind: "working",
              organisation,
              organisations,
              view: { kind: "events" },
            })
          }
          organisation={organisation}
          session={session}
        />
      )}
    </main>
  );
}
