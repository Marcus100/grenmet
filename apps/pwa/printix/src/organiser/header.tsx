import { BUTTON_SECONDARY } from "@/organiser/styles";

interface OrganiserHeaderProps {
  readonly email: string | null;
  readonly onSignOut: () => void;
  /** Shown only when the person may run Printix for more than one organisation. */
  readonly onSwitch: (() => void) | null;
  /** The organisation this screen acts for; null before one is chosen. */
  readonly organisationName: string | null;
}

/** The signed-in strip at the top of every organiser screen. */
export function OrganiserHeader({
  organisationName,
  email,
  onSwitch,
  onSignOut,
}: OrganiserHeaderProps) {
  return (
    <header className="border-px-rule flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-px-muted text-sm">Printix organiser</p>
        {organisationName ? (
          <p className="text-lg font-semibold break-words">
            {organisationName}
          </p>
        ) : null}
        {email ? (
          <p className="text-px-muted text-sm break-all">
            Signed in as {email}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {onSwitch ? (
          <button className={BUTTON_SECONDARY} onClick={onSwitch} type="button">
            Switch organisation
          </button>
        ) : null}
        <button className={BUTTON_SECONDARY} onClick={onSignOut} type="button">
          Sign out
        </button>
      </div>
    </header>
  );
}
