import type { AccountProfilePublic } from "@barrelsgd/api-client";
import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { type ChecklistItem, profileChecklist } from "@/lib/profile-checklist";

interface ProfileChecklistProps {
  /** Null when the photo could not be checked. */
  hasPhoto: boolean | null;
  profile: AccountProfilePublic;
}

const ACTION_LINK =
  "inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** A tick or an empty ring. Decoration only: the words beside it say the state. */
function StateMark({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
        done
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-transparent"
      )}
    >
      ✓
    </span>
  );
}

function RowAction({ action }: { action: ChecklistItem["action"] }) {
  if (action === null) return null;
  const className = cn(ACTION_LINK, "shrink-0");
  if (action.kind === "anchor") {
    return (
      <a className={className} href={action.href}>
        {action.label}
      </a>
    );
  }
  return (
    <Link className={className} href={action.href}>
      {action.label}
    </Link>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <li className="flex gap-3 py-3">
      <StateMark done={item.done} />
      <div className="flex min-w-0 flex-1 flex-col gap-x-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">
            {item.title}
            <span className="sr-only">
              {item.done ? " (done)" : " (to do)"}
            </span>
          </p>
          <p className="text-muted-foreground text-sm break-words">
            {item.value}
          </p>
        </div>
        <RowAction action={item.action} />
      </div>
    </li>
  );
}

/**
 * "Finish your profile": four rows (email, name, phone, photo), each with one
 * action, and a line saying how many are done. The card stays when everything
 * is done and says so; it is never hidden.
 */
export function ProfileChecklist({ hasPhoto, profile }: ProfileChecklistProps) {
  const items = profileChecklist(profile, hasPhoto);
  const done = items.filter((item) => item.done).length;
  const complete = done === items.length;
  return (
    <section
      aria-labelledby="profile-checklist-heading"
      className="rounded-lg border p-4 sm:p-6"
    >
      <h2 className="text-lg font-semibold" id="profile-checklist-heading">
        {complete ? "Profile complete" : "Finish your profile"}
      </h2>
      <p className="text-muted-foreground text-sm">
        {done} of {items.length} done
        {complete ? ". You can change any of these at any time." : ""}
      </p>
      <ul className="mt-2 divide-y">
        {items.map((item) => (
          <ChecklistRow item={item} key={item.key} />
        ))}
      </ul>
    </section>
  );
}
