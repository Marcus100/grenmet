import type {
  PassportTrailPublic,
  RewardsAchievementPublic,
  StreakPublic,
} from "@barrelsgd/api-client";
import {
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import {
  errorBoxClass,
  inputClass,
  labelClass,
} from "@/components/form-styles";
import { PendingButton } from "@/components/pending-button";

/** Result of loading one section; a failed section shows a fallback only. */
export type Loaded<T> = { ok: true; data: T } | { ok: false };

const FALLBACK = "We couldn't load this right now. Try again in a moment.";

function Unavailable() {
  return (
    <p className={`${errorBoxClass} my-5`} role="alert">
      {FALLBACK}
    </p>
  );
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

export function StreakSection({
  streak,
}: {
  readonly streak: Loaded<StreakPublic>;
}) {
  return (
    <SettingsSection title="Check-in streak">
      {streak.ok ? (
        <SettingsRow
          description={
            streak.data.last_check_in
              ? `Last check-in ${streak.data.last_check_in}. Longest streak: ${days(streak.data.longest_days)}.`
              : "No check-ins yet. Your streak starts with your first visit."
          }
          title={`Current streak: ${days(streak.data.current_days)}`}
        >
          <StatusBadge tone={streak.data.checked_in_today ? "on" : "off"}>
            {streak.data.checked_in_today
              ? "Checked in today"
              : "Not checked in today"}
          </StatusBadge>
        </SettingsRow>
      ) : (
        <Unavailable />
      )}
    </SettingsSection>
  );
}

function TrailRow({ trail }: { readonly trail: PassportTrailPublic }) {
  const percent =
    trail.required > 0
      ? Math.min(100, Math.round((trail.stamped / trail.required) * 100))
      : 0;
  const window = [
    trail.starts_on ? `from ${trail.starts_on}` : null,
    trail.ends_on ? `until ${trail.ends_on}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <SettingsRow
      description={[trail.description, window].filter(Boolean).join(" · ")}
      title={trail.name}
    >
      <div className="space-y-2">
        <p className="text-foreground text-sm">
          {trail.stamped} of {trail.required} stamps
        </p>
        <div
          aria-label={`${trail.name} progress`}
          aria-valuemax={trail.required}
          aria-valuemin={0}
          aria-valuenow={Math.min(trail.stamped, trail.required)}
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="h-full bg-(--auth-accent)"
            style={{ width: `${percent}%` }}
          />
        </div>
        {trail.completed ? (
          <StatusBadge tone="on">Trail complete</StatusBadge>
        ) : null}
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {trail.stops.map((stop) => (
          <li
            className="flex items-center justify-between gap-2 text-sm"
            key={stop.id}
          >
            <span className="min-w-0 text-foreground">{stop.label}</span>
            <StatusBadge tone={stop.stamped_at ? "on" : "off"}>
              {stop.stamped_at ? "Stamped" : "Not yet"}
            </StatusBadge>
          </li>
        ))}
      </ul>
    </SettingsRow>
  );
}

export function PassportSection({
  trails,
}: {
  readonly trails: Loaded<PassportTrailPublic[]>;
}) {
  return (
    <SettingsSection title="Passport">
      {trails.ok && trails.data.length === 0 ? (
        <p className="py-5 text-muted-foreground text-sm">
          No trails yet. Visit a participating place and check in to collect
          your first stamp.
        </p>
      ) : null}
      {trails.ok ? (
        trails.data.map((trail) => <TrailRow key={trail.id} trail={trail} />)
      ) : (
        <Unavailable />
      )}
    </SettingsSection>
  );
}

export function AchievementsSection({
  achievements,
}: {
  readonly achievements: Loaded<RewardsAchievementPublic[]>;
}) {
  return (
    <SettingsSection title="Achievements">
      {achievements.ok && achievements.data.length === 0 ? (
        <p className="py-5 text-muted-foreground text-sm">
          No achievements to show yet.
        </p>
      ) : null}
      {achievements.ok ? (
        achievements.data.map((item) => (
          <SettingsRow
            description={item.description}
            key={item.key}
            title={item.name}
          >
            <StatusBadge tone={item.earned ? "on" : "off"}>
              {item.earned
                ? `Earned${item.awarded_at ? ` ${item.awarded_at.slice(0, 10)}` : ""}`
                : "Not yet"}
            </StatusBadge>
          </SettingsRow>
        ))
      ) : (
        <Unavailable />
      )}
    </SettingsSection>
  );
}

export const CHECK_IN_NOTICES: Record<
  string,
  { readonly text: string; readonly error: boolean }
> = {
  "checked-in": {
    error: false,
    text: "You're checked in. Your stamps and streak are updated below.",
  },
  "already-checked-in": {
    error: false,
    text: "You've already checked in at this venue today. Come back tomorrow.",
  },
  "invalid-code": {
    error: true,
    text: "That code isn't valid or has expired. Venue codes change every minute, so scan or type the one on the screen now.",
  },
  unavailable: {
    error: true,
    text: "Check-in isn't available right now. Please try again in a few minutes.",
  },
  "check-in-failed": {
    error: true,
    text: "That didn't work. Try again, or ask the team if it keeps happening.",
  },
};

export function CheckInSection({
  action,
  notice,
}: {
  readonly action: (formData: FormData) => void | Promise<void>;
  readonly notice?: string;
}) {
  const outcome = notice ? CHECK_IN_NOTICES[notice] : undefined;
  return (
    <section
      aria-labelledby="check-in-title"
      className="space-y-3"
      id="check-in"
    >
      <h2
        className="font-mono text-label text-muted-foreground uppercase tracking-widest"
        id="check-in-title"
      >
        Check in at a venue
      </h2>
      <p className="text-muted-foreground text-sm">
        Rewards come from real visits, not from opening the app. Scan the QR
        code at a participating venue, or type the code shown on its screen. One
        check-in per venue per day. There is no ranking by spend.
      </p>
      {outcome ? (
        <p
          className={outcome.error ? errorBoxClass : "text-foreground text-sm"}
          role={outcome.error ? "alert" : "status"}
        >
          {outcome.text}
        </p>
      ) : null}
      <form action={action} className="space-y-3">
        <label className={labelClass} htmlFor="check-in-token">
          Venue code
        </label>
        <input
          autoCapitalize="off"
          autoComplete="off"
          className={inputClass}
          id="check-in-token"
          maxLength={200}
          minLength={10}
          name="token"
          required
          spellCheck={false}
          type="text"
        />
        <PendingButton pendingLabel="Checking in…">Check in</PendingButton>
      </form>
    </section>
  );
}
