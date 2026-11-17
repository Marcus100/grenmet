import type { PrintixOrganiserOrganisation } from "@barrelsgd/api-client";
import { type Problem, problemMessage } from "@/organiser/errors";
import { ALERT, BUTTON_PRIMARY, BUTTON_ROW, NOTE } from "@/organiser/styles";

/** The role a person holds in an organisation, in words. */
export function roleLabel(organisation: PrintixOrganiserOrganisation): string {
  return organisation.can_manage_events ? "Organiser" : "Gate lead";
}

interface ChooseOrganisationProps {
  readonly onPick: (organisation: PrintixOrganiserOrganisation) => void;
  readonly onRetry: () => void;
  /** null while the list is loading. */
  readonly organisations: PrintixOrganiserOrganisation[] | null;
  readonly problem: Problem | null;
}

/**
 * Lists the organisations this person can run Printix for. Only shown when the
 * person has several: one organisation is opened straight away by the app.
 */
export function ChooseOrganisation({
  organisations,
  problem,
  onPick,
  onRetry,
}: ChooseOrganisationProps) {
  if (problem) {
    return (
      <section className="flex flex-col gap-4">
        <p className={ALERT} role="alert">
          {problemMessage(problem)}
        </p>
        <button className={BUTTON_PRIMARY} onClick={onRetry} type="button">
          Try again
        </button>
      </section>
    );
  }
  if (organisations === null) {
    return (
      <p className="text-px-muted text-base" role="status">
        Loading your organisations…
      </p>
    );
  }
  if (organisations.length === 0) {
    return (
      <p className={NOTE} role="status">
        Your account has no Printix role yet. Ask Barrels to give you an
        organiser or gate lead role.
      </p>
    );
  }
  return (
    <section aria-labelledby="choose-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold" id="choose-title">
          Choose an organisation
        </h2>
        <p className="text-px-muted text-sm">
          Each organisation has its own events and gates.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {organisations.map((organisation) => (
          <li key={organisation.id}>
            <button
              className={BUTTON_ROW}
              onClick={() => onPick(organisation)}
              type="button"
            >
              <span className="min-w-0 font-semibold break-words">
                {organisation.name}
              </span>
              <span className="text-px-muted shrink-0 text-sm">
                {roleLabel(organisation)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
