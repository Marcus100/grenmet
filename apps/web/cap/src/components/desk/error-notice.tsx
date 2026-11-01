import type { DeskError } from "@/lib/desk/errors";

/** A refused or failed desk action, with every problem listed on its own line. */
export function DeskErrorNotice({ error }: { error: DeskError | null }) {
  if (!error) return null;
  return (
    <div
      className="space-y-2 rounded-lg border border-destructive bg-destructive/10 p-4 text-body-sm"
      role="alert"
    >
      <p className="font-semibold text-destructive">{error.title}</p>
      {error.items.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-foreground">
          {[...new Set(error.items)].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {error.kind === "session" ? (
        <a className="font-medium text-info underline" href="/desk/signin">
          Sign in again
        </a>
      ) : null}
    </div>
  );
}
